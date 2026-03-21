import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";
import type { ModelAdapter, ModelEnv } from "../types";

const REQUIRED_KEYS = [
  "CLOUDFLARE_AIG_TOKEN",
  "CLOUDFLARE_AIG_ACCOUNT_ID",
  "CLOUDFLARE_AIG_GATEWAY_ID",
  "CLOUDFLARE_PROVIDER_KEY",
  "CLOUDFLARE_PROVIDER_KIND",
] as const;

function normalizeModelId(modelId: string, kind: string) {
  if (modelId.includes("/")) {
    return modelId;
  }
  return `${kind}/${modelId}`;
}

export const cloudflareAiGatewayModel: ModelAdapter = {
  name: "cloudflare_ai_gateway",
  createModel(modelId: string, env: ModelEnv) {
    // Validate all required keys are present before using them
    for (const key of REQUIRED_KEYS) {
      if (!env[key]) {
        throw new Error(`${key} is not configured`);
      }
    }

    const gateway = createAiGateway({
      accountId: env.CLOUDFLARE_AIG_ACCOUNT_ID!,
      gateway: env.CLOUDFLARE_AIG_GATEWAY_ID!,
      apiKey: env.CLOUDFLARE_AIG_TOKEN!,
    });

    const providerKey = env.CLOUDFLARE_PROVIDER_KEY!;
    const providerKind = env.CLOUDFLARE_PROVIDER_KIND!;
    const unified = createUnified({ apiKey: providerKey });

    const targetModel = normalizeModelId(modelId, providerKind);
    return gateway(unified(targetModel));
  },
};
