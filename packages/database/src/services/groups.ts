import { desc, eq } from "drizzle-orm";
import { db } from "../client";
import { groupAgents, groupMembers, groupRuntime, groups } from "../schema";

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
  publicKey: string
) {
  const now = new Date();
  const existing = await getGroupRuntime(groupId);

  if (existing) {
    await db
      .update(groupRuntime)
      .set({
        groupControllerId: controllerId,
        status: "active",
        publicKey,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(groupRuntime.groupId, groupId));
  } else {
    await db.insert(groupRuntime).values({
      groupId,
      groupControllerId: controllerId,
      status: "active",
      publicKey,
      lastActiveAt: now,
      updatedAt: now,
    });
  }
}

export async function updateGroupRuntimeStatus(
  groupId: string,
  status: string
) {
  const now = new Date();
  await db
    .update(groupRuntime)
    .set({ status, updatedAt: now })
    .where(eq(groupRuntime.groupId, groupId));
}
