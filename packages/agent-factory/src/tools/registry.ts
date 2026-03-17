import type { ZodTypeAny } from "zod";
import type { ToolImplementation, ToolRegistry } from "../types";
import type { ToolProvider } from "./provider";

export class DefaultToolRegistry implements ToolRegistry {
  private tools = new Map<string, ToolImplementation>();

  register<TSchema extends ZodTypeAny = ZodTypeAny>(
    tool: ToolImplementation<TSchema>,
  ) {
    this.tools.set(tool.id, tool as ToolImplementation);
  }

  registerAll(tools: ToolImplementation[]): void {
    for (const tool of tools) {
      this.tools.set(tool.id, tool);
    }
  }

  get(toolId: string) {
    return this.tools.get(toolId);
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  list(): ToolImplementation[] {
    return Array.from(this.tools.values());
  }

  static async fromProviders(
    providers: ToolProvider[],
  ): Promise<DefaultToolRegistry> {
    const registry = new DefaultToolRegistry();
    for (const provider of providers) {
      const tools = await provider.getTools();
      registry.registerAll(tools);
    }
    return registry;
  }
}
