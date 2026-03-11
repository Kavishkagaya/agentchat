import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  configAgents,
  configArchives,
  configMembers,
  configRuntime,
  configSnapshots,
  configs,
} from "../schema";

export interface CreateChatParams {
  agentIds: string[];
  config: Record<string, unknown>;
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

  await db.insert(configs).values({
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
    await db.insert(configMembers).values(
      params.memberIds.map((userId) => ({
        groupId: params.chatId,
        userId,
        role: userId === params.createdBy ? "owner" : "member",
        addedBy: params.createdBy,
        createdAt: now,
      }))
    );
  }

  if (params.agentIds.length > 0) {
    await db.insert(configAgents).values(
      params.agentIds.map((agentId) => ({
        groupId: params.chatId,
        agentId,
        addedBy: params.createdBy,
        createdAt: now,
      }))
    );
  }

  return params.chatId;
}

export const createGroup = createChat;

export async function getChat(chatId: string) {
  const db = getDb();
  return await db.query.configs.findFirst({
    where: eq(configs.id, chatId),
    with: {
      members: true,
      agents: true,
    },
  });
}

export const getGroup = getChat;

export async function getOrgChats(orgId: string) {
  const db = getDb();
  return await db.query.configs.findMany({
    where: eq(configs.orgId, orgId),
    orderBy: [desc(configs.lastActiveAt)],
  });
}

export const getOrgGroups = getOrgChats;

export async function getAllChats() {
  const db = getDb();
  return await db.query.configs.findMany({
    orderBy: [desc(configs.createdAt)],
  });
}

export const getAllGroups = getAllChats;

export async function getChatRuntime(chatId: string) {
  const db = getDb();
  return await db.query.configRuntime.findFirst({
    where: eq(configRuntime.groupId, chatId),
  });
}

export const getGroupRuntime = getChatRuntime;

export async function initializeChatRuntime(
  chatId: string,
  controllerId: string,
  publicKey?: string | null
) {
  const db = getDb();
  const now = new Date();
  const existing = await getChatRuntime(chatId);

  if (existing) {
    await db
      .update(configRuntime)
      .set({
        groupControllerId: controllerId,
        status: "active",
        publicKey: publicKey ?? null,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(configRuntime.groupId, chatId));
  } else {
    await db.insert(configRuntime).values({
      groupId: chatId,
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

  await db
    .update(configs)
    .set(chatUpdate)
    .where(eq(configs.id, chatId));

  await db
    .update(configRuntime)
    .set({
      status,
      updatedAt: now,
      ...(status === "active" ? { lastActiveAt: now } : {}),
      ...(status === "idle" ? { idleAt: now } : {}),
    })
    .where(eq(configRuntime.groupId, chatId));
}

export const updateGroupRuntimeStatus = updateChatRuntimeStatus;

export async function countOrgActiveChats(orgId: string, excludeChatId?: string) {
  const db = getDb();
  const activePredicate = and(
    eq(configs.orgId, orgId),
    inArray(configs.status, ["active", "idle"])
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

export const countOrgActiveGroups = countOrgActiveChats;

export async function touchChatActivity(chatId: string, at = new Date()) {
  const db = getDb();
  await db
    .update(configs)
    .set({
      status: "active",
      lastActiveAt: at,
      updatedAt: at,
    })
    .where(eq(configs.id, chatId));

  await db
    .update(configRuntime)
    .set({
      status: "active",
      lastActiveAt: at,
      updatedAt: at,
    })
    .where(eq(configRuntime.groupId, chatId));
}

export const touchGroupActivity = touchChatActivity;

export async function markChatArchived(chatId: string, at = new Date()) {
  const db = getDb();
  await db
    .update(configs)
    .set({
      status: "archived",
      archivedAt: at,
      updatedAt: at,
    })
    .where(eq(configs.id, chatId));

  await db
    .update(configRuntime)
    .set({
      status: "archived",
      updatedAt: at,
    })
    .where(eq(configRuntime.groupId, chatId));
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

  await db.insert(configSnapshots).values({
    id: snapshotId,
    groupId: params.chatId,
    r2Path: params.r2Path,
    sizeBytes: params.sizeBytes ?? null,
    createdAt: now,
  });

  await db.insert(configArchives).values({
    id: archiveId,
    groupId: params.chatId,
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
  config?: Record<string, unknown>;
  agentIds?: string[];
}

export async function updateChat(params: UpdateChatParams) {
  const db = getDb();
  const now = new Date();

  const updates: Record<string, unknown> = { updatedAt: now };
  if (params.title !== undefined) {
    updates.title = params.title;
  }
  if (params.config !== undefined) {
    updates.config = params.config;
    updates.agentPolicy = extractAgentPolicy(params.config);
  }

  await db
    .update(configs)
    .set(updates)
    .where(and(eq(configs.id, params.chatId), eq(configs.orgId, params.orgId)));

  if (params.agentIds !== undefined) {
    await db
      .delete(configAgents)
      .where(eq(configAgents.groupId, params.chatId));

    if (params.agentIds.length > 0) {
      await db.insert(configAgents).values(
        params.agentIds.map((agentId) => ({
          groupId: params.chatId,
          agentId,
          addedBy: null,
          createdAt: now,
        }))
      );
    }
  }

  return getChat(params.chatId);
}

export async function deleteChat(chatId: string, orgId: string) {
  const db = getDb();

  // Verify ownership
  const chat = await db.query.configs.findFirst({
    where: and(eq(configs.id, chatId), eq(configs.orgId, orgId)),
  });
  if (!chat) {
    throw new Error("Chat not found");
  }

  // Delete in FK order: children first, then parent
  await db.delete(configAgents).where(eq(configAgents.groupId, chatId));
  await db.delete(configMembers).where(eq(configMembers.groupId, chatId));
  await db.delete(configArchives).where(eq(configArchives.groupId, chatId));
  await db.delete(configSnapshots).where(eq(configSnapshots.groupId, chatId));
  await db.delete(configRuntime).where(eq(configRuntime.groupId, chatId));
  await db.delete(configs).where(eq(configs.id, chatId));

  return { deleted: true };
}