import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";
import type { ProviderAdapter, ProviderEnv } from "../types";

const REQUIRED_KEYS = [
  "CLOUDFLARE_AIG_TOKEN",
  "CLOUDFLARE_AIG_ACCOUNT_ID",
  "CLOUDFLARE_AIG_GATEWAY_ID",
  "CLOUDFLARE_PROVIDER_KEY",
  "CLOUDFLARE_PROVIDER_KIND",
] as const;

function requireEnv(env: ProviderEnv, key: (typeof REQUIRED_KEYS)[number]) {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

function normalizeModelId(modelId: string, kind: string) {
  if (modelId.includes("/")) {
    return modelId;
  }
  return `${kind}/${modelId}`;
}

export const cloudflareAiGatewayProvider: ProviderAdapter = {
  name: "cloudflare_ai_gateway",
  createModel(modelId: string, env: ProviderEnv) {
    for (const key of REQUIRED_KEYS) {
      requireEnv(env, key);
    }

    const gateway = createAiGateway({
      accountId: requireEnv(env, "CLOUDFLARE_AIG_ACCOUNT_ID"),
      gateway: requireEnv(env, "CLOUDFLARE_AIG_GATEWAY_ID"),
      apiKey: requireEnv(env, "CLOUDFLARE_AIG_TOKEN"),
    });

    const providerKey = requireEnv(env, "CLOUDFLARE_PROVIDER_KEY");
    const providerKind = requireEnv(env, "CLOUDFLARE_PROVIDER_KIND");
    const unified = createUnified({ apiKey: providerKey });

    const targetModel = normalizeModelId(modelId, providerKind);
    return gateway(unified(targetModel));
  },
};
