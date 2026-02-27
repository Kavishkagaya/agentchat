import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  groupAgents,
  groupArchives,
  groupMembers,
  groupRuntime,
  groupSnapshots,
  groups,
} from "../schema";

export interface CreateGroupParams {
  agentIds: string[];
  config: Record<string, unknown>;
  createdBy: string;
  groupId: string;
  isPrivate: boolean;
  memberIds: string[];
  orgId: string;
  title: string;
}

function extractAgentPolicy(config: Record<string, unknown>) {
  const candidate = config.agent_policy;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return {};
}

export async function createGroup(params: CreateGroupParams) {
  const now = new Date();

  await db.insert(groups).values({
    id: params.groupId,
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
    await db.insert(groupMembers).values(
      params.memberIds.map((userId) => ({
        groupId: params.groupId,
        userId,
        role: userId === params.createdBy ? "owner" : "member",
        addedBy: params.createdBy,
        createdAt: now,
      }))
    );
  }

  if (params.agentIds.length > 0) {
    await db.insert(groupAgents).values(
      params.agentIds.map((agentId) => ({
        groupId: params.groupId,
        agentId,
        addedBy: params.createdBy,
        createdAt: now,
      }))
    );
  }

  return params.groupId;
}

export async function getGroup(groupId: string) {
  return await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
    with: {
      members: true,
      agents: true,
    },
  });
}

export async function getOrgGroups(orgId: string) {
  return await db.query.groups.findMany({
    where: eq(groups.orgId, orgId),
    orderBy: [desc(groups.lastActiveAt)],
  });
}

export async function getAllGroups() {
  return await db.query.groups.findMany({
    orderBy: [desc(groups.createdAt)],
  });
}

export async function getGroupRuntime(groupId: string) {
  return await db.query.groupRuntime.findFirst({
    where: eq(groupRuntime.groupId, groupId),
  });
}

export async function initializeGroupRuntime(
  groupId: string,
  controllerId: string,
  publicKey?: string | null
) {
  const now = new Date();
  const existing = await getGroupRuntime(groupId);

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
      .where(eq(groupRuntime.groupId, groupId));
  } else {
    await db.insert(groupRuntime).values({
      groupId,
      groupControllerId: controllerId,
      status: "active",
      publicKey: publicKey ?? null,
      lastActiveAt: now,
      updatedAt: now,
    });
  }
}

export async function updateGroupRuntimeStatus(groupId: string, status: string) {
  const now = new Date();

  const groupUpdate: {
    status: string;
    updatedAt: Date;
    lastActiveAt?: Date;
    archivedAt?: Date;
  } = {
    status,
    updatedAt: now,
  };
  if (status === "active") {
    groupUpdate.lastActiveAt = now;
  }
  if (status === "archived") {
    groupUpdate.archivedAt = now;
  }

  await db
    .update(groups)
    .set(groupUpdate)
    .where(eq(groups.id, groupId));

  await db
    .update(groupRuntime)
    .set({
      status,
      updatedAt: now,
      ...(status === "active" ? { lastActiveAt: now } : {}),
      ...(status === "idle" ? { idleAt: now } : {}),
    })
    .where(eq(groupRuntime.groupId, groupId));
}

export async function countOrgActiveGroups(orgId: string, excludeGroupId?: string) {
  const activePredicate = and(
    eq(groups.orgId, orgId),
    inArray(groups.status, ["active", "idle"])
  );
  const wherePredicate =
    excludeGroupId && excludeGroupId.length > 0
      ? and(activePredicate, ne(groups.id, excludeGroupId))
      : activePredicate;

  const rows = await db
    .select({
      value: sql<number>`count(*)`,
    })
    .from(groups)
    .where(wherePredicate);
  return Number(rows[0]?.value ?? 0);
}

export async function touchGroupActivity(groupId: string, at = new Date()) {
  await db
    .update(groups)
    .set({
      status: "active",
      lastActiveAt: at,
      updatedAt: at,
    })
    .where(eq(groups.id, groupId));

  await db
    .update(groupRuntime)
    .set({
      status: "active",
      lastActiveAt: at,
      updatedAt: at,
    })
    .where(eq(groupRuntime.groupId, groupId));
}

export async function markGroupArchived(groupId: string, at = new Date()) {
  await db
    .update(groups)
    .set({
      status: "archived",
      archivedAt: at,
      updatedAt: at,
    })
    .where(eq(groups.id, groupId));

  await db
    .update(groupRuntime)
    .set({
      status: "archived",
      updatedAt: at,
    })
    .where(eq(groupRuntime.groupId, groupId));
}

export async function listGroupsForAutoArchive(
  inactiveDays: number,
  now = new Date()
) {
  const cutoff = new Date(now.getTime() - inactiveDays * 24 * 60 * 60 * 1000);
  return await db.query.groups.findMany({
    where: and(
      inArray(groups.status, ["active", "idle"]),
      or(lte(groups.lastActiveAt, cutoff), lte(groups.updatedAt, cutoff))
    ),
    columns: {
      id: true,
      orgId: true,
      status: true,
      lastActiveAt: true,
      updatedAt: true,
    },
  });
}

export async function recordGroupArchive(params: {
  groupId: string;
  r2Path: string;
  sizeBytes?: number;
  at?: Date;
}) {
  const now = params.at ?? new Date();
  const snapshotId = `snapshot_${randomUUID()}`;
  const archiveId = `archive_${randomUUID()}`;

  await db.insert(groupSnapshots).values({
    id: snapshotId,
    groupId: params.groupId,
    r2Path: params.r2Path,
    sizeBytes: params.sizeBytes ?? null,
    createdAt: now,
  });

  await db.insert(groupArchives).values({
    id: archiveId,
    groupId: params.groupId,
    snapshotId,
    r2Path: params.r2Path,
    createdAt: now,
  });

  return { archiveId, snapshotId };
}
