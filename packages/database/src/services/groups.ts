import { eq, and, desc } from "drizzle-orm";
import { groups, groupMembers, groupAgents, groupRuntime } from "../schema";
import type { Db } from "../types";

export interface CreateGroupParams {
  groupId: string;
  orgId: string;
  title: string;
  isPrivate: boolean;
  agentPolicy: any; // Ideally strictly typed from schema
  createdBy: string;
  agentIds: string[];
  memberIds: string[];
}

export async function createGroup(db: Db, params: CreateGroupParams) {
  const now = new Date();

  // 1. Create Group
  await db.insert(groups).values({
    groupId: params.groupId,
    orgId: params.orgId,
    title: params.title,
    status: "active",
    isPrivate: params.isPrivate,
    agentPolicy: params.agentPolicy,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now
  });

  // 2. Add Members
  if (params.memberIds.length > 0) {
    await db.insert(groupMembers).values(
      params.memberIds.map(userId => ({
        groupId: params.groupId,
        userId,
        role: userId === params.createdBy ? "owner" : "member",
        addedBy: params.createdBy,
        createdAt: now
      }))
    );
  }

  // 3. Add Agents
  if (params.agentIds.length > 0) {
    await db.insert(groupAgents).values(
      params.agentIds.map(agentId => ({
        groupId: params.groupId,
        agentId,
        addedBy: params.createdBy,
        createdAt: now
      }))
    );
  }

  return params.groupId;
}

export async function getGroup(db: Db, groupId: string) {
  return await db.query.groups.findFirst({
    where: eq(groups.groupId, groupId),
    with: {
      members: true, 
      agents: true
    }
  });
}

export async function getGroupRuntime(db: Db, groupId: string) {
  return await db.query.groupRuntime.findFirst({
    where: eq(groupRuntime.groupId, groupId)
  });
}

export async function getAllGroups(db: Db) {
  return await db.query.groups.findMany({
    orderBy: [desc(groups.createdAt)]
  });
}

export async function initializeGroupRuntime(
  db: Db, 
  groupId: string, 
  controllerId: string, 
  publicKey: string
) {
  const now = new Date();
  
  // Check if exists
  const existing = await getGroupRuntime(db, groupId);
  
  if (existing) {
    // Update existing
    await db.update(groupRuntime)
      .set({ 
        groupControllerId: controllerId,
        status: "active", 
        publicKey, 
        lastActiveAt: now,
        updatedAt: now 
      })
      .where(eq(groupRuntime.groupId, groupId));
  } else {
    // Create new
    await db.insert(groupRuntime).values({
      groupId,
      groupControllerId: controllerId,
      status: "active",
      publicKey,
      lastActiveAt: now,
      updatedAt: now
    });
  }
}

export async function updateGroupRuntimeStatus(db: Db, groupId: string, status: string) {
  const now = new Date();
  await db.update(groupRuntime)
    .set({ status, updatedAt: now })
    .where(eq(groupRuntime.groupId, groupId));
}