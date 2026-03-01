import {
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  getSecretValue,
  listMcpServers,
  updateMcpServer,
  updateMcpServerStatus,
} from "@axon/database";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "../trpc";

const mcpAddInput = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  secretId: z.string().uuid().nullable().optional(),
});

async function fetchMcpTools(
  url: string,
  token?: string | null
): Promise<Array<{ name: string; description?: string | null; inputSchema?: Record<string, unknown> | null }>> {
  const client = new Client({
    name: "AgentChat",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    token
      ? {
          requestInit: {
            headers: {
              Authorization: `Bearer ${token}`,
            } as HeadersInit,
          },
        }
      : undefined
  );

  try {
    await client.connect(transport);

    // List available tools
    const toolsResult = await client.listTools();

    return toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
    }));
  } finally {
    await transport.close();
  }
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
      secretRef: server.secretRef,
      lastValidatedAt: server.lastValidatedAt,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    }));
  }),

  add: orgProcedure.input(mcpAddInput).mutation(async ({ ctx, input }) => {
    let token: string | undefined;

    if (input.secretId) {
      const secret = await getSecretValue({
        orgId: ctx.auth.orgId,
        secretId: input.secretId,
      });
      if (!secret) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Secret not found",
        });
      }
      token = secret.value;
    }

    const config: Record<string, unknown> = {
      url: input.url,
    };

    if (input.secretId) {
      config.auth = {
        type: "bearer",
        credentials_ref: {
          secret_id: input.secretId,
          version: "latest",
        },
      };
    }

    const created = await createMcpServer({
      orgId: ctx.auth.orgId,
      name: input.name,
      url: input.url,
      secretRef: input.secretId ?? null,
      token: "",
      config,
      createdBy: ctx.auth.userId || "system",
    });

    try {
      const tools = await fetchMcpTools(input.url, token);
      await updateMcpServerStatus({
        serverId: created.serverId,
        orgId: ctx.auth.orgId,
        status: "valid",
      });
      return { ...created, status: "valid" as const, toolCount: tools.length };
    } catch (error) {
      await updateMcpServerStatus({
        serverId: created.serverId,
        orgId: ctx.auth.orgId,
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : "MCP fetch error",
      });
      return { ...created, status: "error" as const };
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
        const secretId =
          config?.auth?.credentials_ref?.secret_id ?? server.secretRef;

        let token: string | undefined;

        if (secretId && typeof secretId === "string") {
          const secret = await getSecretValue({
            orgId: ctx.auth.orgId,
            secretId,
          });
          if (!secret) {
            throw new Error("Secret not found for MCP server");
          }

          // Use bearer token as-is
          token = secret.value;
        }

        const url =
          (typeof config.url === "string" ? config.url : undefined) ??
          server.url;

        const tools = await fetchMcpTools(url, token);
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
          errorMessage:
            error instanceof Error ? error.message : "MCP fetch error",
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to refresh MCP tools.",
        });
      }
    }),

  previewTools: orgProcedure
    .input(
      z.object({
        url: z.string().url(),
        secretId: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let token: string | undefined;

      if (input.secretId) {
        const secret = await getSecretValue({
          orgId: ctx.auth.orgId,
          secretId: input.secretId,
        });
        if (!secret) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Secret not found",
          });
        }
        token = secret.value;
      }

      try {
        const tools = await fetchMcpTools(input.url, token);
        return tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? null,
          inputSchema: tool.inputSchema ?? null,
        }));
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? `Failed to reach MCP server: ${error.message}`
              : "Failed to reach MCP server",
        });
      }
    }),

  update: orgProcedure
    .input(
      z.object({
        serverId: z.string().min(1),
        name: z.string().min(1),
        url: z.string().url(),
        secretId: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getMcpServer({
        serverId: input.serverId,
        orgId: ctx.auth.orgId,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      let token: string | undefined;

      if (input.secretId) {
        const secret = await getSecretValue({
          orgId: ctx.auth.orgId,
          secretId: input.secretId,
        });
        if (!secret) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Secret not found",
          });
        }
        token = secret.value;
      }

      const existingConfig =
        (existing.config as Record<string, unknown> | null) ?? {};

      const newConfig: Record<string, unknown> = {
        ...existingConfig,
        url: input.url,
      };

      if (input.secretId) {
        newConfig.auth = {
          type: "bearer",
          credentials_ref: {
            secret_id: input.secretId,
            version: "latest",
          },
        };
      }

      try {
        await fetchMcpTools(input.url, token);

        await updateMcpServer({
          serverId: input.serverId,
          orgId: ctx.auth.orgId,
          name: input.name,
          url: input.url,
          secretRef: input.secretId ?? null,
          config: newConfig,
        });

        await updateMcpServerStatus({
          serverId: input.serverId,
          orgId: ctx.auth.orgId,
          status: "valid",
        });

        return { ok: true, status: "valid" as const };
      } catch (error) {
        await updateMcpServer({
          serverId: input.serverId,
          orgId: ctx.auth.orgId,
          name: input.name,
          url: input.url,
          secretRef: input.secretId ?? null,
          config: newConfig,
        });

        await updateMcpServerStatus({
          serverId: input.serverId,
          orgId: ctx.auth.orgId,
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "MCP fetch error",
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? `Server updated but tool fetch failed: ${error.message}`
              : "Server updated but tool fetch failed",
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

      // Resolve secret and fetch tools from MCP server
      const config = (server.config as Record<string, unknown> | null) ?? {};
      const authConfig = config.auth as Record<string, unknown> | undefined;
      const credentialsRef = authConfig?.credentials_ref as
        | Record<string, unknown>
        | undefined;
      const secretId =
        (credentialsRef?.secret_id as string | undefined) ?? server.secretRef;

      let token: string | undefined;

      if (secretId && typeof secretId === "string") {
        const secret = await getSecretValue({
          orgId: ctx.auth.orgId,
          secretId,
        });
        if (!secret) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Secret not found",
          });
        }
        token = secret.value;
      }

      const url =
        (typeof config.url === "string" ? config.url : undefined) ?? server.url;

      try {
        const tools = await fetchMcpTools(url, token);

        return tools.map((tool) => ({
          serverId: input.serverId,
          toolId: tool.name,
          name: tool.name,
          description: tool.description ?? null,
          inputSchema: tool.inputSchema ?? null,
        }));
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? `Failed to fetch tools from MCP server: ${error.message}`
              : "Failed to fetch tools from MCP server",
        });
      }
    }),

  delete: orgProcedure
    .input(z.object({ serverId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const server = await getMcpServer({
        serverId: input.serverId,
        orgId: ctx.auth.orgId,
      });
      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Delete server and associated tools will be handled by database cascade
      await deleteMcpServer({
        serverId: input.serverId,
        orgId: ctx.auth.orgId,
      });

      return { ok: true };
    }),
});
