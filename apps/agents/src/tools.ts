import {
  createSandboxTools,
  createSkillLoaderTool,
  DefaultToolRegistry,
} from "@axon/agent-factory";
import type { SandboxResolver, SkillRecord } from "@axon/shared";

export interface ToolRegistryOptions {
  sandboxResolver?: SandboxResolver;
  sandboxToolIds?: string[];
  skills?: SkillRecord[];
}

/**
 * Create a tool registry for an agent run.
 * Assembles sandbox tools (filtered by enabled IDs) and skill loader tool.
 * MCP tools are handled separately at the runner level via @ai-sdk/mcp.
 */
export function createToolRegistry(
  options?: ToolRegistryOptions,
): DefaultToolRegistry {
  const registry = new DefaultToolRegistry();

  // Register sandbox tools (filtered by enabled IDs)
  if (options?.sandboxResolver && options?.sandboxToolIds?.length) {
    const enabledIds = new Set(options.sandboxToolIds);
    const sandboxTools = createSandboxTools(options.sandboxResolver);
    registry.registerAll(
      sandboxTools.filter((tool) => enabledIds.has(tool.id)),
    );
  }

  // Register skill loader tool
  if (options?.skills?.length) {
    registry.register(createSkillLoaderTool(options.skills));
  }

  return registry;
}
