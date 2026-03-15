import { randomUUID } from "node:crypto";
import type { ChatRoutingConfig } from "@axon/shared";
import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  chatAgents,
  chatArchives,
  chatMembers,
  chatRuntime,
  chatSnapshots,
  chats,
} from "../schema";

export interface CreateChatParams {
  agentIds: string[];
  config: ChatRoutingConfig;
  createdBy: string;
  chatId: string;
  isPrivate: boolean;
  memberIds: string[];
  orgId: string;
  title: string;
}

export type CreateGroupParams = CreateChatParams;

function extractAgentPolicy(config: Record<string, unknown>) {
  const candidate = config.agent_policy;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return {};
}

export async function createChat(params: CreateChatParams) {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(chats).values({
      id: params.chatId,
      orgId: params.orgId,
      title: params.title,
      status: "active",
      isPrivate: params.isPrivate,
      config: params.config,
      agentPolicy: extractAgentPolicy(params.config),
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });

    if (params.memberIds.length > 0) {
      await tx.insert(chatMembers).values(
        params.memberIds.map((userId) => ({
          configId: params.chatId,
          userId,
          role: userId === params.createdBy ? "owner" : "member",
          addedBy: params.createdBy,
          createdAt: now,
        })),
      );
    }

    if (params.agentIds.length > 0) {
      await tx.insert(chatAgents).values(
        params.agentIds.map((agentId) => ({
          configId: params.chatId,
          agentId,
          addedBy: params.createdBy,
          createdAt: now,
        })),
      );
    }
  });

  return params.chatId;
}

export const createGroup = createChat;

export async function getChat(chatId: string) {
  const db = getDb();
  return await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: {
      members: true,
      agents: true,
    },
  });
}

export const getGroup = getChat;

export async function getOrgChats(orgId: string) {
  const db = getDb();
  return await db.query.chats.findMany({
    where: eq(chats.orgId, orgId),
    orderBy: [desc(chats.lastActiveAt)],
  });
}

export const getOrgGroups = getOrgChats;

export async function getAllChats() {
  const db = getDb();
  return await db.query.chats.findMany({
    orderBy: [desc(chats.createdAt)],
  });
}

export const getAllGroups = getAllChats;

export async function getChatRuntime(chatId: string) {
  const db = getDb();
  return await db.query.chatRuntime.findFirst({
    where: eq(chatRuntime.configId, chatId),
  });
}

export const getGroupRuntime = getChatRuntime;

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

export const initializeGroupRuntime = initializeChatRuntime;

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

  await db.update(chats).set(chatUpdate).where(eq(chats.id, chatId));

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

export const updateGroupRuntimeStatus = updateChatRuntimeStatus;

export async function countOrgActiveChats(
  orgId: string,
  excludeChatId?: string,
) {
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

export const countOrgActiveGroups = countOrgActiveChats;

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

export const touchGroupActivity = touchChatActivity;

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

export const markGroupArchived = markChatArchived;

export async function recordChatArchive(params: {
  chatId: string;
  r2Path: string;
  sizeBytes?: number;
  at?: Date;
}) {
  const db = getDb();
  const now = params.at ?? new Date();
  const snapshotId = `snapshot_${randomUUID()}`;
  const archiveId = `archive_${randomUUID()}`;

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

export const recordGroupArchive = recordChatArchive;

export interface UpdateChatParams {
  chatId: string;
  orgId: string;
  title?: string;
  config?: ChatRoutingConfig;
  agentIds?: string[];
}

export async function updateChat(params: UpdateChatParams) {
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    const updates: Record<string, unknown> = { updatedAt: now };
    if (params.title !== undefined) {
      updates.title = params.title;
    }
    if (params.config !== undefined) {
      updates.config = params.config;
      updates.agentPolicy = extractAgentPolicy(params.config);
    }

    await tx
      .update(chats)
      .set(updates)
      .where(and(eq(chats.id, params.chatId), eq(chats.orgId, params.orgId)));

    if (params.agentIds !== undefined) {
      await tx.delete(chatAgents).where(eq(chatAgents.configId, params.chatId));

      if (params.agentIds.length > 0) {
        await tx.insert(chatAgents).values(
          params.agentIds.map((agentId) => ({
            configId: params.chatId,
            agentId,
            addedBy: null,
            createdAt: now,
          })),
        );
      }
    }
  });

  return getChat(params.chatId);
}

export async function deleteChat(chatId: string, orgId: string) {
  const db = getDb();

  // Verify ownership
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.orgId, orgId)),
  });
  if (!chat) {
    throw new Error("Chat not found");
  }

  // Delete in FK order: children first, then parent
  await db.transaction(async (tx) => {
    await tx.delete(chatAgents).where(eq(chatAgents.configId, chatId));
    await tx.delete(chatMembers).where(eq(chatMembers.configId, chatId));
    await tx.delete(chatArchives).where(eq(chatArchives.configId, chatId));
    await tx.delete(chatSnapshots).where(eq(chatSnapshots.configId, chatId));
    await tx.delete(chatRuntime).where(eq(chatRuntime.configId, chatId));
    await tx.delete(chats).where(eq(chats.id, chatId));
  });

  return { deleted: true };
}
