import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { skills } from "../schema";

export interface CreateSkillParams {
  name: string;
  description?: string;
  content: string;
  orgId: string;
}

export async function getSkills(orgId: string) {
  const db = getDb();
  return await db.query.skills.findMany({
    where: eq(skills.orgId, orgId),
    orderBy: [desc(skills.updatedAt)],
  });
}

export async function getSkill(skillId: string, orgId: string) {
  const db = getDb();
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.orgId, orgId)),
  });
  return skill ?? null;
}

export async function createSkill(params: CreateSkillParams) {
  const db = getDb();
  const id = `skill_${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(skills).values({
    id,
    orgId: params.orgId,
    name: params.name,
    description: params.description,
    content: params.content,
    createdAt: now,
    updatedAt: now,
  });

  return { id };
}

export interface UpdateSkillParams {
  skillId: string;
  orgId: string;
  name?: string;
  description?: string;
  content?: string;
}

export async function updateSkill(params: UpdateSkillParams) {
  const db = getDb();

  // Verify ownership
  const skill = await getSkill(params.skillId, params.orgId);
  if (!skill) {
    throw new Error("Skill not found");
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.content !== undefined) updates.content = params.content;

  await db
    .update(skills)
    .set(updates)
    .where(eq(skills.id, params.skillId));

  return { success: true };
}

export async function deleteSkill(skillId: string, orgId: string) {
  const db = getDb();

  // Verify ownership
  const skill = await getSkill(skillId, orgId);
  if (!skill) {
    throw new Error("Skill not found");
  }

  await db.delete(skills).where(eq(skills.id, skillId));

  return { success: true };
}
