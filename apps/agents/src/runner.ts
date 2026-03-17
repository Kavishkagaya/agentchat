import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import {
  type AgentRunInput,
  type AgentStreamEvent,
  createAgentRunner,
  normalizeAgentConfig,
} from "@axon/agent-factory";
import type { SkillRecord } from "@axon/shared";
import { getDb } from "@axon/worker-database";
import type { AgentConfigRecord } from "./config";
import type { Env } from "./env";
import { resolveMcpServers, resolveModelEnv, resolveTooling } from "./resolution";
import { createToolRegistry } from "./tools";
import { createCfSandboxResolver } from "./tools/sandbox-resolver";

export type RunResult = {
  text: string;
  finish_reason?: string;
  usage?: unknown;
};

export type ToolEventCallbacks = {
  onToolCall?: (toolId: string, args: unknown, toolName?: string) => void;
  onToolError?: (toolId: string, error: string) => void;
};

export async function buildAgentRunner(
  record: AgentConfigRecord,
  env: Env,
  callbacks?: ToolEventCallbacks,
) {
  const config = normalizeAgentConfig(record.agentId, record.config);
  const { modelEnv, modelType, modelId } = await resolveModelEnv(
    env,
    record.orgId,
    record.modelId,
  );

  if (modelType) {
    config.provider = modelType;
  }
  if (modelId) {
    config.model = modelId;
  }

  // Resolve which tools and MCP servers are needed
  const { sandboxToolIds, mcpServerIds } = await resolveTooling(
    env,
    record.orgId,
    record.config,
  );

  // Load skills if configured
  let skills: SkillRecord[] = [];
  const skillIds = (record.config as Record<string, unknown>)?.skills as
    | string[]
    | undefined;

  if (skillIds?.length) {
    try {
      const db = getDb();
      const dbSkills = await db.query.skills.findMany({
        where: (t, { inArray }) => inArray(t.id, skillIds),
      });
      skills = dbSkills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? undefined,
        content: s.content,
        orgId: s.orgId,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }));

      // Inject skill list into system prompt
      if (skills.length > 0) {
        const skillsPrompt = `Available skills:\n${skills
          .map((s) => `- \`${s.name}\`: ${s.description || ""}`)
          .join("\n")}`;

        if (config.system_prompt) {
          config.system_prompt = `${skillsPrompt}\n\n${config.system_prompt}`;
        } else {
          config.system_prompt = skillsPrompt;
        }
      }
    } catch (error) {
      // Log but don't fail if skill loading fails
      console.error("Failed to load skills:", error);
    }
  }

  // Create MCP clients and get tool sets
  const mcpClients = await Promise.all(
    mcpServerIds.map((serverId) =>
      resolveMcpServers(env, record.orgId, [serverId]).then((servers) => {
        if (servers.length === 0) {
          throw new Error(`Failed to resolve MCP server: ${serverId}`);
        }
        const server = servers[0];
        return createMCPClient({
          transport: {
            type: "http",
            url: server.url,
            headers: { Authorization: `Bearer ${server.token}` },
          },
        });
      }),
    ),
  );

  // Get tool sets from MCP clients and merge them
  const mcpToolSetsList = await Promise.all(
    mcpClients.map((client) => client.tools()),
  );
  const mcpToolSets = mcpToolSetsList.length > 0 ? [Object.assign({}, ...mcpToolSetsList)] : [];

  // Clean up MCP clients after run/stream completes
  const closeMcpClients = async () => {
    await Promise.all(mcpClients.map((client) => client.close()));
  };

  // Create sandbox resolver (CF-specific implementation)
  const sandboxResolver = createCfSandboxResolver(env);

  // Build tool registry with sandbox and skill tools
  const toolRegistry = createToolRegistry({
    sandboxResolver,
    sandboxToolIds,
    skills,
  });

  // Set config.tools to empty since all tools come through registry now
  config.tools = [];

  const runner = createAgentRunner({
    config,
    env: modelEnv,
    toolRegistry,
    mcpToolSets,
    options: {
      maxSteps: 10,
      onToolCall: callbacks?.onToolCall,
      onFinish: closeMcpClients,
    },
  });

  return runner;
}

export async function runAgent(
  record: AgentConfigRecord,
  env: Env,
  input: AgentRunInput,
  callbacks?: ToolEventCallbacks,
): Promise<RunResult> {
  const runner = await buildAgentRunner(record, env, callbacks);
  const result = await runner.run(input);
  return result;
}

export async function* streamAgent(
  record: AgentConfigRecord,
  env: Env,
  input: AgentRunInput,
  callbacks?: ToolEventCallbacks,
): AsyncGenerator<AgentStreamEvent> {
  const runner = await buildAgentRunner(record, env, callbacks);
  yield* runner.runStream(input);
}
