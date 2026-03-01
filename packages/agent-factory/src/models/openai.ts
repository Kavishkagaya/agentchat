import { createOpenAI } from "@ai-sdk/openai";
import type { ModelAdapter, ModelEnv } from "../types";

export const openAIModel: ModelAdapter = {
  name: "openai",
  createModel(modelId: string, env: ModelEnv) {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    const baseURL = env.OPENAI_BASE_URL;
    const openai = createOpenAI({ apiKey, baseURL });
    return openai(modelId);
  },
};
