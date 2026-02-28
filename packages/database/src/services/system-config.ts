import { eq } from "drizzle-orm";
import { db } from "../client";
import { systemConfigs } from "../schema";

export async function getSystemConfig(key: string): Promise<unknown | null> {
  const result = await db.query.systemConfigs.findFirst({
    where: eq(systemConfigs.key, key),
  });
  return result?.value ?? null;
}

export async function setSystemConfig(
  key: string,
  value: unknown
): Promise<void> {
  const now = new Date();
  await db
    .insert(systemConfigs)
    .values({
      key,
      value,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: systemConfigs.key,
      set: {
        value,
        updatedAt: now,
      },
    });
}
