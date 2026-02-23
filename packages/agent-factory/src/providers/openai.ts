import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderAdapter, ProviderEnv } from "../types";

export const openAIProvider: ProviderAdapter = {
  name: "openai",
  createModel(modelId: string, env: ProviderEnv) {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    const baseURL = env.OPENAI_BASE_URL;
    const openai = createOpenAI({ apiKey, baseURL });
    return openai(modelId);
  },
};
