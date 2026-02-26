import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { mcpServerTools, mcpServers } from "../schema";

export type McpServerStatus = "pending" | "valid" | "error";

export interface CreateMcpServerParams {
  orgId: string;
  name: string;
  url: string;
  token?: string | null;
  secretRef?: string | null;
  createdBy: string;
}

export type McpToolInput = {
  toolId: string;
  name: string;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
};

export async function createMcpServer(params: CreateMcpServerParams) {
  const now = new Date();
  const id = `mcp_${randomUUID()}`;

  await db.insert(mcpServers).values({
    id,
    orgId: params.orgId,
    name: params.name,
    url: params.url,
    token: params.token ?? "",
    secretRef: params.secretRef ?? null,
    status: "pending",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  });

  return { serverId: id, createdAt: now };
}

export async function updateMcpServerStatus(params: {
  serverId: string;
  orgId: string;
  status: McpServerStatus;
  errorMessage?: string | null;
}) {
  const now = new Date();
  await db
    .update(mcpServers)
    .set({
      status: params.status,
      errorMessage: params.errorMessage ?? null,
      lastValidatedAt: now,
      updatedAt: now,
    })
    .where(and(eq(mcpServers.id, params.serverId), eq(mcpServers.orgId, params.orgId)));

  return { updatedAt: now };
}

export async function listMcpServers(orgId: string) {
  return await db.query.mcpServers.findMany({
    where: eq(mcpServers.orgId, orgId),
    orderBy: (servers, { desc }) => [desc(servers.updatedAt)],
  });
}

export async function getMcpServer(params: { serverId: string; orgId: string }) {
  return await db.query.mcpServers.findFirst({
    where: and(eq(mcpServers.id, params.serverId), eq(mcpServers.orgId, params.orgId)),
  });
}

export async function upsertMcpTools(params: {
  serverId: string;
  tools: McpToolInput[];
}) {
  const now = new Date();

  for (const tool of params.tools) {
    await db
      .insert(mcpServerTools)
      .values({
        serverId: params.serverId,
        toolId: tool.toolId,
        name: tool.name,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [mcpServerTools.serverId, mcpServerTools.toolId],
        set: {
          name: tool.name,
          description: tool.description ?? null,
          inputSchema: tool.inputSchema ?? null,
          updatedAt: now,
        },
      });
  }

  return { updatedAt: now };
}

export async function listMcpTools(serverId: string) {
  return await db.query.mcpServerTools.findMany({
    where: eq(mcpServerTools.serverId, serverId),
    orderBy: (tools, { asc }) => [asc(tools.name)],
  });
}
