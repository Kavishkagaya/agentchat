import {
  createDefaultTools,
  DefaultToolRegistry,
  type ToolImplementation,
} from "@axon/agent-factory";
import { z } from "zod";
import type { ResolvedMcpTool } from "./resolution";
import { recordToolError } from "./telemetry";

type ToolRegistryOptions = {
  mcpTools?: ResolvedMcpTool[];
  onToolError?: (toolId: string, error: string) => void;
};

async function invokeMcpTool(tool: ResolvedMcpTool, args: unknown) {
  const requestBody = { input: args, args };
  const endpoint = `${tool.serverUrl.replace(/\/$/, "")}/tools/${tool.toolId}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tool.token}`,
    },
    body: JSON.stringify(requestBody),
  });

  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;
  if (contentType.includes("json")) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "mcp_tool_error",
      status: response.status,
      tool: tool.id,
      details: payload,
    };
  }

  return {
    ok: true,
    tool: tool.id,
    data: payload,
  };
}

function buildMcpToolImpl(
  tool: ResolvedMcpTool,
  onToolError?: (toolId: string, error: string) => void
): ToolImplementation {
  return {
    id: tool.id,
    description: tool.description ?? `MCP tool: ${tool.name}`,
    schema: z.record(z.string(), z.any()),
    execute: async (args) => {
      try {
        return await invokeMcpTool(tool, args);
      } catch (error) {
        const message = error instanceof Error ? error.message : "mcp invoke failed";
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

  const tools = createDefaultTools();
  for (const toolImpl of tools) {
    registry.register(toolImpl);
  }

  for (const mcpTool of options?.mcpTools ?? []) {
    registry.register(buildMcpToolImpl(mcpTool, options?.onToolError));
  }

  return registry;
}
