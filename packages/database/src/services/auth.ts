import { eq, and } from "drizzle-orm";
import { groupMembers, orgMembers } from "../schema";
import type { Db } from "../types";

export async function verifyUserInGroup(db: Db, userId: string, groupId: string) {
  const member = await db.query.groupMembers.findFirst({
    where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))
  });
  
  if (!member) {
    return null;
  }
  
  return member.role;
}

export async function getUserOrgRole(db: Db, userId: string, orgId: string) {
  const member = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId))
  });

  if (!member) {
    return null;
  }

  return member.role;
}
