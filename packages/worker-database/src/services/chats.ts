import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  agentRuntimes,
  chatAgentRuntimes,
  chatArchives,
  chatRuntime,
  chatSnapshots,
  chats,
} from "../schema";

export async function getChatRuntime(chatId: string) {
  const db = getDb();
  return await db.query.chatRuntime.findFirst({
    where: eq(chatRuntime.configId, chatId),
  });
}

export async function initializeChatRuntime(
  chatId: string,
  controllerId: string,
  publicKey?: string | null,
) {
  const db = getDb();
  const now = new Date();
  const existing = await getChatRuntime(chatId);

  if (existing) {
    await db
      .update(chatRuntime)
      .set({
        groupControllerId: controllerId,
        status: "active",
        publicKey: publicKey ?? null,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(chatRuntime.configId, chatId));
  } else {
    await db.insert(chatRuntime).values({
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
  const now = new Date();

  const chatUpdate: {
    status: string;
    updatedAt: Date;
    lastActiveAt?: Date;
    archivedAt?: Date;
  } = {
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
    .update(chats)
    .set(chatUpdate)
    .where(eq(chats.id, chatId));

  await db
    .update(chatRuntime)
    .set({
      status,
      updatedAt: now,
      ...(status === "active" ? { lastActiveAt: now } : {}),
      ...(status === "idle" ? { idleAt: now } : {}),
    })
    .where(eq(chatRuntime.configId, chatId));
}

export async function countOrgActiveChats(orgId: string, excludeChatId?: string) {
  const db = getDb();
  const activePredicate = and(
    eq(chats.orgId, orgId),
    inArray(chats.status, ["active", "idle"]),
  );
  const wherePredicate =
    excludeChatId && excludeChatId.length > 0
      ? and(activePredicate, ne(chats.id, excludeChatId))
      : activePredicate;

  const rows = await db
    .select({
      value: sql<number>`count(*)`,
    })
    .from(chats)
    .where(wherePredicate);
  return Number(rows[0]?.value ?? 0);
}

export async function touchChatActivity(chatId: string, at = new Date()) {
  const db = getDb();
  await db
    .update(chats)
    .set({
      status: "active",
      lastActiveAt: at,
      updatedAt: at,
    })
    .where(eq(chats.id, chatId));

  await db
    .update(chatRuntime)
    .set({
      status: "active",
      lastActiveAt: at,
      updatedAt: at,
    })
    .where(eq(chatRuntime.configId, chatId));
}

export async function markChatArchived(chatId: string, at = new Date()) {
  const db = getDb();
  await db
    .update(chats)
    .set({
      status: "archived",
      archivedAt: at,
      updatedAt: at,
    })
    .where(eq(chats.id, chatId));

  await db
    .update(chatRuntime)
    .set({
      status: "archived",
      updatedAt: at,
    })
    .where(eq(chatRuntime.configId, chatId));
}

export async function recordChatArchive(params: {
  chatId: string;
  r2Path: string;
  sizeBytes?: number;
  at?: Date;
}) {
  const db = getDb();
  const now = params.at ?? new Date();
  const snapshotId = `snapshot_${crypto.randomUUID()}`;
  const archiveId = `archive_${crypto.randomUUID()}`;

  await db.insert(chatSnapshots).values({
    id: snapshotId,
    configId: params.chatId,
    r2Path: params.r2Path,
    sizeBytes: params.sizeBytes ?? null,
    createdAt: now,
  });

  await db.insert(chatArchives).values({
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

  // Delete runtime data only (chat is owned by main DB)
  // neon-http driver does not support transactions — delete sequentially in FK order
  await db.delete(chatAgentRuntimes).where(eq(chatAgentRuntimes.configId, chatId));
  await db.delete(chatArchives).where(eq(chatArchives.configId, chatId));
  await db.delete(chatSnapshots).where(eq(chatSnapshots.configId, chatId));
  await db.delete(agentRuntimes).where(eq(agentRuntimes.configId, chatId));
  await db.delete(chatRuntime).where(eq(chatRuntime.configId, chatId));

  return { deleted: true };
}