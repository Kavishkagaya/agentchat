import type { ToolImplementation, ToolRegistry } from "../types";

export class DefaultToolRegistry implements ToolRegistry {
  private tools = new Map<string, ToolImplementation>();

  register(tool: ToolImplementation) {
    this.tools.set(tool.id, tool);
  }

  get(toolId: string) {
    return this.tools.get(toolId);
  }
}
