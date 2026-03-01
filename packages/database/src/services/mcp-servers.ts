import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { mcpServers } from "../schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertSecretId(secretId: string) {
  if (!UUID_PATTERN.test(secretId)) {
    throw new Error("secret_id must be a UUID");
  }
}

export type McpServerStatus = "pending" | "valid" | "error";

export interface CreateMcpServerParams {
  config: Record<string, unknown>;
  createdBy: string;
  name: string;
  orgId: string;
  secretRef?: string | null;
  token?: string | null;
  url: string;
}

export async function createMcpServer(params: CreateMcpServerParams) {
  const db = getDb();
  if (params.secretRef) {
    assertSecretId(params.secretRef);
  }

  const now = new Date();
  const id = `mcp_${randomUUID()}`;

  await db.insert(mcpServers).values({
    id,
    orgId: params.orgId,
    name: params.name,
    url: params.url,
    token: params.token ?? "",
    secretRef: params.secretRef ?? null,
    config: params.config,
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
  const db = getDb();
  const now = new Date();
  await db
    .update(mcpServers)
    .set({
      status: params.status,
      errorMessage: params.errorMessage ?? null,
      lastValidatedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(mcpServers.id, params.serverId),
        eq(mcpServers.orgId, params.orgId)
      )
    );

  return { updatedAt: now };
}

export interface UpdateMcpServerParams {
  config: Record<string, unknown>;
  name: string;
  orgId: string;
  secretRef?: string | null;
  serverId: string;
  url: string;
}

export async function updateMcpServer(params: UpdateMcpServerParams) {
  const db = getDb();
  if (params.secretRef) {
    assertSecretId(params.secretRef);
  }

  const now = new Date();
  await db
    .update(mcpServers)
    .set({
      name: params.name,
      url: params.url,
      secretRef: params.secretRef ?? null,
      config: params.config,
      updatedAt: now,
    })
    .where(
      and(
        eq(mcpServers.id, params.serverId),
        eq(mcpServers.orgId, params.orgId)
      )
    );

  return { updatedAt: now };
}

export async function listMcpServers(orgId: string) {
  const db = getDb();
  return await db.query.mcpServers.findMany({
    where: eq(mcpServers.orgId, orgId),
    orderBy: (servers, { desc }) => [desc(servers.updatedAt)],
  });
}

export async function getMcpServer(params: {
  serverId: string;
  orgId: string;
}) {
  const db = getDb();
  return await db.query.mcpServers.findFirst({
    where: and(
      eq(mcpServers.id, params.serverId),
      eq(mcpServers.orgId, params.orgId)
    ),
  });
}

export async function deleteMcpServer(params: {
  serverId: string;
  orgId: string;
}) {
  const db = getDb();
  await db
    .delete(mcpServers)
    .where(
      and(
        eq(mcpServers.id, params.serverId),
        eq(mcpServers.orgId, params.orgId)
      )
    );

  return { ok: true };
}
