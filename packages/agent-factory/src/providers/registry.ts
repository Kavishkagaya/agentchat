import type { ProviderAdapter } from "../types";
import { cloudflareAiGatewayProvider } from "./cloudflare-ai-gateway";
import { openAIProvider } from "./openai";

export class ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  constructor() {
    this.register(cloudflareAiGatewayProvider);
    this.register(openAIProvider);
  }

  register(adapter: ProviderAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string) {
    return this.adapters.get(name);
  }
}
