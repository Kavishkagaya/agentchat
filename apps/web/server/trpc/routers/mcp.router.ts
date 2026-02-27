import {
  createMcpServer,
  getMcpServer,
  getSecretValue,
  listMcpServers,
  listMcpTools,
  updateMcpServerStatus,
  upsertMcpTools,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "../trpc";

const mcpServerInput = z.object({
  name: z.string().min(1),
  config: z.object({
    url: z.string().url(),
    auth: z.object({
      type: z.literal("bearer"),
      credentials_ref: z.object({
        secret_id: z.string().uuid(),
        version: z.string().default("latest"),
      }),
    }),
    validation: z
      .object({
        tools_path: z.string().default("/tools"),
        health_path: z.string().optional(),
      })
      .optional(),
  }).strict(),
}).strict();

type McpToolPayload = {
  id: string;
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
};

async function fetchMcpTools(url: string, token: string, toolsPath = "/tools"): Promise<McpToolPayload[]> {
  const normalized = url.replace(/\/$/, "");
  const response = await fetch(`${normalized}${toolsPath}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`MCP fetch failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as { tools?: McpToolPayload[] };
  if (!payload.tools) {
    throw new Error("MCP response missing tools");
  }

  return payload.tools;
}

export const mcpRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    const servers = await listMcpServers(ctx.auth.orgId);
    return servers.map((server) => ({
      id: server.id,
      name: server.name,
      url: server.url,
      status: server.status,
      errorMessage: server.errorMessage,
      config: server.config,
      lastValidatedAt: server.lastValidatedAt,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    }));
  }),

  add: orgProcedure
    .input(mcpServerInput)
    .mutation(async ({ ctx, input }) => {
      const secret = await getSecretValue({
        orgId: ctx.auth.orgId,
        secretId: input.config.auth.credentials_ref.secret_id,
      });
      if (!secret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Secret not found" });
      }
      const token = secret.value;

      const created = await createMcpServer({
        orgId: ctx.auth.orgId,
        name: input.name,
        url: input.config.url,
        secretRef: input.config.auth.credentials_ref.secret_id,
        token: "",
        config: input.config,
        createdBy: ctx.auth.userId,
      });

      try {
        const tools = await fetchMcpTools(
          input.config.url,
          token,
          input.config.validation?.tools_path
        );
        await upsertMcpTools({
          serverId: created.serverId,
          tools: tools.map((tool) => ({
            toolId: tool.id,
            name: tool.name,
            description: tool.description ?? null,
            inputSchema: tool.input_schema ?? null,
          })),
        });
        await updateMcpServerStatus({
          serverId: created.serverId,
          orgId: ctx.auth.orgId,
          status: "valid",
        });
        return { ...created, status: "valid", toolCount: tools.length };
      } catch (error) {
        await updateMcpServerStatus({
          serverId: created.serverId,
          orgId: ctx.auth.orgId,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "MCP fetch error",
        });
        return { ...created, status: "error" };
      }
    }),

  refresh: orgProcedure
    .input(z.object({ serverId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const server = await getMcpServer({
        serverId: input.serverId,
        orgId: ctx.auth.orgId,
      });
      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      try {
        const config = (server.config as Record<string, any> | null) ?? {};
        const secretId = config?.auth?.credentials_ref?.secret_id ?? server.secretRef;
        if (!secretId || typeof secretId !== "string") {
          throw new Error("Missing MCP credential reference");
        }
        const secret = await getSecretValue({
          orgId: ctx.auth.orgId,
          secretId,
        });
        if (!secret) {
          throw new Error("Secret not found for MCP server");
        }
        const token = secret.value;
        const url =
          (typeof config.url === "string" ? config.url : undefined) ?? server.url;
        const toolsPath =
          typeof config?.validation?.tools_path === "string"
            ? config.validation.tools_path
            : undefined;

        const tools = await fetchMcpTools(url, token, toolsPath);
        await upsertMcpTools({
          serverId: server.id,
          tools: tools.map((tool) => ({
            toolId: tool.id,
            name: tool.name,
            description: tool.description ?? null,
            inputSchema: tool.input_schema ?? null,
          })),
        });
        await updateMcpServerStatus({
          serverId: server.id,
          orgId: ctx.auth.orgId,
          status: "valid",
        });
        return { ok: true, toolCount: tools.length };
      } catch (error) {
        await updateMcpServerStatus({
          serverId: server.id,
          orgId: ctx.auth.orgId,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "MCP fetch error",
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to refresh MCP tools.",
        });
      }
    }),

  listTools: orgProcedure
    .input(z.object({ serverId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const server = await getMcpServer({
        serverId: input.serverId,
        orgId: ctx.auth.orgId,
      });
      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const tools = await listMcpTools(input.serverId);
      return tools.map((tool) => ({
        serverId: tool.serverId,
        toolId: tool.toolId,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    }),
});
