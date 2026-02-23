import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { groupMembers, orgMembers, orgs, users } from "../schema";

export interface SyncUserParams {
  clerkId: string;
  email: string;
  firstName?: string | null;
  imageUrl?: string | null;
  lastName?: string | null;
  password?: string | null;
}

export async function syncUser(params: SyncUserParams) {
  const now = new Date();
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, params.clerkId),
  });

  if (existing) {
    await db
      .update(users)
      .set({
        email: params.email,
        password: params.password ?? existing.password,
        firstName: params.firstName,
        lastName: params.lastName,
        imageUrl: params.imageUrl,
        updatedAt: now,
      })
      .where(eq(users.clerkId, params.clerkId));
    return existing.id;
  }
  const id = `user_${crypto.randomUUID()}`;
  await db.insert(users).values({
    id,
    clerkId: params.clerkId,
    email: params.email,
    password: params.password,
    firstName: params.firstName,
    lastName: params.lastName,
    imageUrl: params.imageUrl,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function syncOrg(clerkOrgId: string, name: string) {
  const now = new Date();
  const existing = await db.query.orgs.findFirst({
    where: eq(orgs.clerkId, clerkOrgId),
  });

  if (existing) {
    await db
      .update(orgs)
      .set({
        name,
        updatedAt: now,
      })
      .where(eq(orgs.clerkId, clerkOrgId));
    return existing.id;
  }
  const id = `org_${crypto.randomUUID()}`;
  await db.insert(orgs).values({
    id,
    clerkId: clerkOrgId,
    name,
    planId: "free",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function syncOrgMember(
  clerkOrgId: string,
  clerkUserId: string,
  role: string
) {
  const now = new Date();

  // Resolve internal IDs
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkUserId),
  });
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.clerkId, clerkOrgId),
  });

  if (!(user && org)) {
    console.error(
      `Could not sync membership: User(${clerkUserId}) or Org(${clerkOrgId}) not found`
    );
    return;
  }

  const existing = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, user.id)),
  });

  if (existing) {
    await db
      .update(orgMembers)
      .set({
        role,
        clerkOrgId,
        clerkUserId,
      })
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, user.id)));
  } else {
    await db.insert(orgMembers).values({
      id: `m_${crypto.randomUUID()}`,
      orgId: org.id,
      userId: user.id,
      clerkOrgId,
      clerkUserId,
      role,
      createdAt: now,
    });
  }
}

export async function deleteOrgMember(clerkOrgId: string, clerkUserId: string) {
  await db
    .delete(orgMembers)
    .where(
      and(
        eq(orgMembers.clerkOrgId, clerkOrgId),
        eq(orgMembers.clerkUserId, clerkUserId)
      )
    );
}

export async function deleteUser(clerkId: string) {
  await db.delete(users).where(eq(users.clerkId, clerkId));
}

export async function deleteOrg(clerkId: string) {
  await db.delete(orgs).where(eq(orgs.clerkId, clerkId));
}

export async function verifyUserInGroup(userId: string, groupId: string) {
  const member = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId)
    ),
  });

  if (!member) {
    return null;
  }

  return member.role;
}

export async function getUserOrgRole(userId: string, orgId: string) {
  const member = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)),
  });

  if (!member) {
    return null;
  }

  return member.role;
}

// Helpers to resolve IDs
export async function getInternalUserId(clerkId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  return user?.id ?? null;
}

export async function getInternalOrgId(clerkId: string) {
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.clerkId, clerkId),
  });
  return org?.id ?? null;
}
