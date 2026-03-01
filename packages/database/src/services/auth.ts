import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { groupMembers, orgMembers, orgs, users } from "../schema";

export interface SyncUserParams {
  clerkId: string;
  email: string;
  firstName?: string | null;
  imageUrl?: string | null;
  lastName?: string | null;
  password?: string | null;
}

export interface AxonUser {
  clerkUserId: string;
  email: string;
  firstName?: string | null;
  imageUrl?: string | null;
  lastName?: string | null;
  organization?: {
    orgId: string;
    clerkOrgId: string;
    name: string;
    role: string;
  } | null;
  userId: string;
}

export async function syncUser(params: SyncUserParams) {
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
  const now = new Date();

  // Map Clerk roles to internal roles
  // org:admin -> admin, org:member -> user, anything else -> user
  const internalRole = mapClerkRoleToInternal(role);

  // Resolve internal IDs
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkUserId),
  });

  if (!user) {
    throw new Error(
      `Could not sync membership: User(${clerkUserId}) not found`
    );
  }

  const org = await db.query.orgs.findFirst({
    where: eq(orgs.clerkId, clerkOrgId),
  });

  if (!org) {
    throw new Error(`Could not sync membership: Org(${clerkOrgId}) not found`);
  }

  const existing = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, user.id)),
  });

  if (existing) {
    await db
      .update(orgMembers)
      .set({
        role: internalRole,
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
      role: internalRole,
      createdAt: now,
    });
  }
}

/**
 * Map Clerk organization roles to internal role representation
 * Clerk roles: org:admin, org:member
 * Internal roles: admin, user
 */
function mapClerkRoleToInternal(clerkRole: string): string {
  switch (clerkRole) {
    case "org:admin":
      return "admin";
    case "org:member":
      return "user";
    default:
      return "user";
  }
}

export async function deleteOrgMember(clerkOrgId: string, clerkUserId: string) {
  const db = getDb();
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
  const db = getDb();
  await db.delete(users).where(eq(users.clerkId, clerkId));
}

export async function deleteOrg(clerkId: string) {
  const db = getDb();
  await db.delete(orgs).where(eq(orgs.clerkId, clerkId));
}

export async function verifyUserInGroup(userId: string, groupId: string) {
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  return user?.id ?? null;
}

export async function getInternalOrgId(clerkId: string) {
  const db = getDb();
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.clerkId, clerkId),
  });
  return org?.id ?? null;
}

// Get is super admin
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) {
    throw new Error("User not found");
  }
  return user.role === "admin";
}

// Get me
export async function getMe(
  userId: string,
  orgId: string | null
): Promise<AxonUser | null> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) {
    return null;
  }

  if (!orgId) {
    return {
      clerkUserId: user.clerkId,
      email: user.email,
      firstName: user.firstName,
      imageUrl: user.imageUrl,
      lastName: user.lastName,
      userId: user.id,
    };
  }

  const organization = await db.query.orgs.findFirst({
    where: eq(orgs.id, orgId),
  });

  const role = await getUserOrgRole(user.id, orgId);

  if (!(organization && role)) {
    return {
      clerkUserId: user.clerkId,
      email: user.email,
      firstName: user.firstName,
      imageUrl: user.imageUrl,
      lastName: user.lastName,
      userId: user.id,
    };
  }

  return {
    clerkUserId: user.clerkId,
    email: user.email,
    firstName: user.firstName,
    imageUrl: user.imageUrl,
    lastName: user.lastName,
    userId: user.id,
    organization: {
      orgId: organization.id,
      name: organization.name,
      role,
      clerkOrgId: organization.clerkId,
    },
  };
}
