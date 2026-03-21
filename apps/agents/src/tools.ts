import {
  createSandboxTools,
  createSkillLoaderTool,
  DefaultToolRegistry,
  type ToolImplementation,
} from "@axon/agent-factory";
import type { SandboxResolver, SkillRecord } from "@axon/shared";
import { z } from "zod";

export interface ToolRegistryOptions {
  sandboxResolver?: SandboxResolver;
  sandboxToolIds?: string[];
  skills?: SkillRecord[];
}

const invokeAgentSchema = z.object({
  nickname: z.string().describe("The teammate's nickname"),
  reason: z.string().optional().describe("Why you are delegating"),
});

const invokeAgentTool: ToolImplementation<typeof invokeAgentSchema> = {
  id: "invoke_agent",
  description:
    "Explicitly delegate a task to a teammate agent by their nickname",
  schema: invokeAgentSchema,
  execute: async (args) => {
    // Returns immediately — memory controller handles actual invocation
    return { ok: true, queued: args.nickname };
  },
};

/**
 * Create a tool registry for an agent run.
 * Assembles invoke_agent tool, sandbox tools (filtered by enabled IDs), and skill loader tool.
 * MCP tools are handled separately at the runner level via @ai-sdk/mcp.
 */
export function createToolRegistry(
  options?: ToolRegistryOptions,
): DefaultToolRegistry {
  const registry = new DefaultToolRegistry();

  // Register invoke_agent tool (always available)
  registry.register(invokeAgentTool);

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
