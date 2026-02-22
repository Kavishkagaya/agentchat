import {
  createAgentRunner,
  normalizeAgentConfig,
  type AgentRunInput,
  type ProviderEnv
} from "@axon/agent-factory";
import type { Env } from "./env";
import type { AgentConfigRecord } from "./config";
import { createToolRegistry } from "./tools";

export type RunResult = {
  text: string;
  finish_reason?: string;
  usage?: unknown;
};

export function buildAgentRunner(
  record: AgentConfigRecord,
  env: Env,
  onToolCall?: (toolId: string, args: unknown, toolName?: string) => void
) {
  const toolRegistry = createToolRegistry();
  const config = normalizeAgentConfig(record.agentId, record.config);
  const providerEnv: ProviderEnv = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL
  };

  return createAgentRunner({
    config,
    env: providerEnv,
    toolRegistry,
    options: {
      onToolCall
    }
  });
}

export async function runAgent(
  record: AgentConfigRecord,
  env: Env,
  input: AgentRunInput,
  onToolCall?: (toolId: string, args: unknown, toolName?: string) => void
): Promise<RunResult> {
  const runner = buildAgentRunner(record, env, onToolCall);
  const result = await runner.run(input);
  return result;
}
