import {
  type AgentRunInput,
  createAgentRunner,
  normalizeAgentConfig,
} from "@axon/agent-factory";
import type { AgentConfigRecord } from "./config";
import type { Env } from "./env";
import { resolveModelEnv, resolveTooling } from "./resolution";
import { createToolRegistry } from "./tools";

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
  callbacks?: ToolEventCallbacks
) {
  const config = normalizeAgentConfig(record.agentId, record.config);
  const { modelEnv, modelType, modelId } = await resolveModelEnv(
    env,
    record.orgId,
    record.modelId
  );

  if (modelType) {
    config.provider = modelType;
  }
  if (modelId) {
    config.model = modelId;
  }

  const { toolRefs, mcpTools } = await resolveTooling(env, record.orgId, record.config);
  config.tools = toolRefs;

  const toolRegistry = createToolRegistry({
    mcpTools,
    onToolError: callbacks?.onToolError,
  });

  return createAgentRunner({
    config,
    env: modelEnv,
    toolRegistry,
    options: {
      onToolCall: callbacks?.onToolCall,
    },
  });
}

export async function runAgent(
  record: AgentConfigRecord,
  env: Env,
  input: AgentRunInput,
  callbacks?: ToolEventCallbacks
): Promise<RunResult> {
  const runner = await buildAgentRunner(record, env, callbacks);
  const result = await runner.run(input);
  return result;
}
