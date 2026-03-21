import { createMCPClient } from "@ai-sdk/mcp";
import {
  type AgentRunInput,
  type AgentStreamEvent,
  createAgentRunner,
  normalizeAgentConfig,
} from "@axon/agent-factory";
import type { SkillRecord } from "@axon/shared";
import { getDb } from "@axon/worker-database";
import type { ToolSet } from "ai";
import type { AgentConfigRecord } from "./config";
import type { Env } from "./env";
import {
  resolveMcpServers,
  resolveModelEnv,
  resolveTooling,
} from "./resolution";
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

/**
 * Load and inject skills into the agent config.
 * Fetches skill records from DB and prepends them to the system prompt.
 */
async function resolveSkills(
  rawConfig: unknown,
): Promise<{ skills: SkillRecord[]; systemPromptInjection?: string }> {
  let skills: SkillRecord[] = [];
  let systemPromptInjection: string | undefined;

  const rawSkillIds = (rawConfig as Record<string, unknown>)?.skills;
  // Runtime validation: filter to only string IDs to prevent DB query corruption
  const skillIds = Array.isArray(rawSkillIds)
    ? rawSkillIds.filter((id): id is string => typeof id === "string")
    : undefined;

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

      // Build skill list injection for system prompt
      if (skills.length > 0) {
        systemPromptInjection = `Available skills:\n${skills
          .map((s) => `- \`${s.name}\`: ${s.description || ""}`)
          .join("\n")}`;
      }
    } catch (error) {
      // Log but don't fail if skill loading fails
      console.error("Failed to load skills:", error);
    }
  }

  return { skills, systemPromptInjection };
}

/**
 * Create MCP clients for configured servers and extract their tool sets.
 * Handles partial failures gracefully with cleanup.
 */
async function buildMcpClients(
  env: Env,
  orgId: string,
  serverIds: string[],
): Promise<{ toolSets: ToolSet[]; close: () => Promise<void> }> {
  const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  try {
    for (const serverId of serverIds) {
      const servers = await resolveMcpServers(env, orgId, [serverId]);
      if (servers.length === 0) {
        console.warn(`[MCP] Failed to resolve MCP server: ${serverId}`);
        continue;
      }
      const server = servers[0];
      const client = await createMCPClient({
        transport: {
          type: "http",
          url: server.url,
          headers: { Authorization: `Bearer ${server.token}` },
        },
      });
      mcpClients.push(client);
    }
  } catch (err) {
    // If MCP resolution fails partway through, close the clients we did create
    await Promise.allSettled(mcpClients.map((client) => client.close()));
    throw err;
  }

  // Return tools and cleanup function
  const close = async () => {
    await Promise.allSettled(mcpClients.map((client) => client.close()));
  };

  // Get tool sets from MCP clients and merge them
  try {
    const mcpToolSetsList = await Promise.all(
      mcpClients.map((client) => client.tools()),
    );
    const toolSets =
      mcpToolSetsList.length > 0 ? [Object.assign({}, ...mcpToolSetsList)] : [];
    return { toolSets, close };
  } catch (err) {
    console.error("[MCP] Failed to load tools from clients:", err);
    const toolSets: ToolSet[] = [];
    return { toolSets, close };
  }
}

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
  const { sandboxToolIds, mcpServerIds } = await resolveTooling(record.config);

  // Load skills and get system prompt injection
  const { skills, systemPromptInjection } = await resolveSkills(record.config);
  if (systemPromptInjection) {
    if (config.system_prompt) {
      config.system_prompt = `${systemPromptInjection}\n\n${config.system_prompt}`;
    } else {
      config.system_prompt = systemPromptInjection;
    }
  }

  // Build MCP clients and get tool sets
  const { toolSets: mcpToolSets, close: closeMcpClients } =
    await buildMcpClients(env, record.orgId, mcpServerIds);

  // Create sandbox resolver (CF-specific implementation)
  const sandboxResolver = createCfSandboxResolver(env);

  // Build tool registry with sandbox and skill tools
  const toolRegistry = createToolRegistry({
    sandboxResolver,
    sandboxToolIds,
    skills,
  });

  // Wire registry tools into agent config by generating tool refs from the registry
  // This ensures sandbox tools, skill tools, and any other registered tools are available to the agent
  const registeredToolRefs = toolRegistry.list().map((impl) => ({
    id: impl.id,
    description: impl.description,
  }));
  config.tools = registeredToolRefs;

  const runner = createAgentRunner({
    config,
    env: modelEnv,
    toolRegistry,
    mcpToolSets,
    options: {
      maxSteps: 10,
      onToolCall: callbacks?.onToolCall,
      onToolError: callbacks?.onToolError,
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
