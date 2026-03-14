import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  agentRuntimes,
  configs,
  groupAgentRuntimes,
  groupAgents,
  groupArchives,
  groupMembers,
  groupRuntime,
  groupSecrets,
  groupSnapshots,
  groupTasks,
} from "../schema/schema";

export async function getChatRuntime(chatId: string) {
  const db = getDb();
  return await db.query.groupRuntime.findFirst({
    where: eq(groupRuntime.configId, chatId),
  });
}

export async function initializeChatRuntime(
  chatId: string,
  controllerId: string,
  publicKey?: string | null,
) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await getChatRuntime(chatId);

  if (existing) {
    await db
      .update(groupRuntime)
      .set({
        groupControllerId: controllerId,
        status: "active",
        publicKey: publicKey ?? null,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(groupRuntime.configId, chatId));
  } else {
    await db.insert(groupRuntime).values({
      configId: chatId,
      groupControllerId: controllerId,
      status: "active",
      publicKey: publicKey ?? null,
      lastActiveAt: now,
      updatedAt: now,
    });
  }
}

export async function updateChatRuntimeStatus(chatId: string, status: string) {
  const db = getDb();
  const now = new Date().toISOString();

  const chatUpdate: Record<string, string> = {
    status,
    updatedAt: now,
  };
  if (status === "active") {
    chatUpdate.lastActiveAt = now;
  }
  if (status === "archived") {
    chatUpdate.archivedAt = now;
  }

  await db
    .update(configs)
    .set(chatUpdate)
    .where(eq(configs.id, chatId));

  await db
    .update(groupRuntime)
    .set({
      status,
      updatedAt: now,
      ...(status === "active" ? { lastActiveAt: now } : {}),
      ...(status === "idle" ? { idleAt: now } : {}),
    })
    .where(eq(groupRuntime.configId, chatId));
}

export async function countOrgActiveChats(orgId: string, excludeChatId?: string) {
  const db = getDb();
  const activePredicate = and(
    eq(configs.orgId, orgId),
    inArray(configs.status, ["active", "idle"]),
  );
  const wherePredicate =
    excludeChatId && excludeChatId.length > 0
      ? and(activePredicate, ne(configs.id, excludeChatId))
      : activePredicate;

  const rows = await db
    .select({
      value: sql<number>`count(*)`,
    })
    .from(configs)
    .where(wherePredicate);
  return Number(rows[0]?.value ?? 0);
}

export async function touchChatActivity(chatId: string, at = new Date()) {
  const db = getDb();
  const iso = at.toISOString();
  await db
    .update(configs)
    .set({
      status: "active",
      lastActiveAt: iso,
      updatedAt: iso,
    })
    .where(eq(configs.id, chatId));

  await db
    .update(groupRuntime)
    .set({
      status: "active",
      lastActiveAt: iso,
      updatedAt: iso,
    })
    .where(eq(groupRuntime.configId, chatId));
}

export async function markChatArchived(chatId: string, at = new Date()) {
  const db = getDb();
  const iso = at.toISOString();
  await db
    .update(configs)
    .set({
      status: "archived",
      archivedAt: iso,
      updatedAt: iso,
    })
    .where(eq(configs.id, chatId));

  await db
    .update(groupRuntime)
    .set({
      status: "archived",
      updatedAt: iso,
    })
    .where(eq(groupRuntime.configId, chatId));
}

export async function recordChatArchive(params: {
  chatId: string;
  r2Path: string;
  sizeBytes?: number;
  at?: Date;
}) {
  const db = getDb();
  const now = (params.at ?? new Date()).toISOString();
  const snapshotId = `snapshot_${crypto.randomUUID()}`;
  const archiveId = `archive_${crypto.randomUUID()}`;

  await db.insert(groupSnapshots).values({
    id: snapshotId,
    configId: params.chatId,
    r2Path: params.r2Path,
    sizeBytes: params.sizeBytes ?? null,
    createdAt: now,
  });

  await db.insert(groupArchives).values({
    id: archiveId,
    configId: params.chatId,
    snapshotId,
    r2Path: params.r2Path,
    createdAt: now,
  });

  return { archiveId, snapshotId };
}

export async function deleteChatRuntime(chatId: string) {
  const db = getDb();

  // Delete runtime data only (config is owned by main DB)
  await db.transaction(async (tx) => {
    await tx.delete(groupAgentRuntimes).where(eq(groupAgentRuntimes.configId, chatId));
    await tx.delete(groupAgents).where(eq(groupAgents.configId, chatId));
    await tx.delete(groupMembers).where(eq(groupMembers.configId, chatId));
    await tx.delete(groupSecrets).where(eq(groupSecrets.configId, chatId));
    await tx.delete(groupArchives).where(eq(groupArchives.configId, chatId));
    await tx.delete(groupSnapshots).where(eq(groupSnapshots.configId, chatId));
    await tx.delete(groupTasks).where(eq(groupTasks.configId, chatId));
    await tx.delete(agentRuntimes).where(eq(agentRuntimes.configId, chatId));
    await tx.delete(groupRuntime).where(eq(groupRuntime.configId, chatId));
  });

  return { deleted: true };
}
