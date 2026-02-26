import {
  type AgentRunInput,
  createAgentRunner,
  normalizeAgentConfig,
  type ProviderEnv,
} from "@axon/agent-factory";
import { getProvider, getSecretValue } from "@axon/database";
import type { AgentConfigRecord } from "./config";
import type { Env } from "./env";
import { createToolRegistry } from "./tools";

export type RunResult = {
  text: string;
  finish_reason?: string;
  usage?: unknown;
};

export async function buildAgentRunner(
  record: AgentConfigRecord,
  env: Env,
  onToolCall?: (toolId: string, args: unknown, toolName?: string) => void
) {
  const toolRegistry = createToolRegistry();
  const config = normalizeAgentConfig(record.agentId, record.config);
  let providerEnv: ProviderEnv = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  };

  if (record.providerId) {
    const provider = await getProvider({
      orgId: record.orgId,
      providerId: record.providerId,
    });
    if (!provider) {
      throw new Error("provider not found for agent");
    }
    if (!provider.secretRef) {
      throw new Error("provider secret is not configured");
    }
    const secret = await getSecretValue({
      orgId: record.orgId,
      secretId: provider.secretRef,
    });
    if (!secret) {
      throw new Error("provider secret not found");
    }

    config.provider = provider.providerType;
    config.model = provider.modelId ?? config.model;

    if (provider.providerType === "cloudflare_ai_gateway") {
      providerEnv = {
        ...providerEnv,
        CLOUDFLARE_AIG_TOKEN: env.CLOUDFLARE_AIG_TOKEN,
        CLOUDFLARE_AIG_ACCOUNT_ID: provider.gatewayAccountId,
        CLOUDFLARE_AIG_GATEWAY_ID: provider.gatewayId,
        CLOUDFLARE_PROVIDER_KEY: secret.value,
        CLOUDFLARE_PROVIDER_KIND: provider.kind,
      };
    } else {
      providerEnv = {
        ...providerEnv,
        PROVIDER_API_KEY: secret.value,
      };
    }
  }

  return createAgentRunner({
    config,
    env: providerEnv,
    toolRegistry,
    options: {
      onToolCall,
    },
  });
}

export async function runAgent(
  record: AgentConfigRecord,
  env: Env,
  input: AgentRunInput,
  onToolCall?: (toolId: string, args: unknown, toolName?: string) => void
): Promise<RunResult> {
  const runner = await buildAgentRunner(record, env, onToolCall);
  const result = await runner.run(input);
  return result;
}
