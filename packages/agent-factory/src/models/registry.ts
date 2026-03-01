import type { ModelAdapter } from "../types";
import { cloudflareAiGatewayModel } from "./cloudflare-ai-gateway";
import { openAIModel } from "./openai";

export class ModelRegistry {
  private adapters = new Map<string, ModelAdapter>();

  constructor() {
    this.register(cloudflareAiGatewayModel);
    this.register(openAIModel);
  }

  register(adapter: ModelAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string) {
    return this.adapters.get(name);
  }
}
