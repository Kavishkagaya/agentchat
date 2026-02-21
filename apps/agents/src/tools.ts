import { DefaultToolRegistry, createDefaultTools } from "@agentchat/agent-factory";

export function createToolRegistry() {
  const registry = new DefaultToolRegistry();

  const tools = createDefaultTools();
  for (const toolImpl of tools) {
    registry.register(toolImpl);
  }

  return registry;
}
