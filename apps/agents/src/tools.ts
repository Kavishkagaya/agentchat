import {
  createDefaultTools,
  DefaultToolRegistry,
  type ToolImplementation,
} from "@axon/agent-factory";
import { createSandboxSkills } from "@axon/agent-skills-sandbox";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import type { Env } from "./env";
import type { ResolvedMcpTool } from "./resolution";
import { recordToolError } from "./telemetry";

type ToolRegistryOptions = {
  mcpTools?: ResolvedMcpTool[];
  onToolError?: (toolId: string, error: string) => void;
  env?: Env;
};

async function invokeMcpTool(tool: ResolvedMcpTool, args: unknown) {
  const client = new Client({ name: "AgentChat", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(tool.serverUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${tool.token}`,
      } as HeadersInit,
    },
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: tool.toolId,
      arguments: args as Record<string, unknown>,
    });

    return {
      ok: true,
      tool: tool.id,
      data: (result.content as any)?.[0]?.text ?? result,
    };
  } finally {
    await transport.close();
  }
}

function buildMcpToolImpl(
  tool: ResolvedMcpTool,
  onToolError?: (toolId: string, error: string) => void,
): ToolImplementation {
  return {
    id: tool.id,
    description: tool.description ?? `MCP tool: ${tool.name}`,
    schema: z.record(z.string(), z.any()),
    execute: async (args) => {
      try {
        return await invokeMcpTool(tool, args);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "mcp invoke failed";
        onToolError?.(tool.id, message);
        recordToolError(tool.id, message);
        return {
          ok: false,
          error: "mcp_invoke_failed",
          tool: tool.id,
          message,
        };
      }
    },
  };
}

export function createToolRegistry(options?: ToolRegistryOptions) {
  const registry = new DefaultToolRegistry();

  // Register default tools (echo, current_time, http_request)
  const tools = createDefaultTools();
  for (const toolImpl of tools) {
    registry.register(toolImpl);
  }

  // Register sandbox skills (file ops, shell exec, etc.)
  if (options?.env) {
    const sandboxSkills = createSandboxSkills(options.env);
    for (const skill of sandboxSkills) {
      registry.register(skill);
    }
  }

  // Register MCP tools
  for (const mcpTool of options?.mcpTools ?? []) {
    registry.register(buildMcpToolImpl(mcpTool, options?.onToolError));
  }

  return registry;
}
