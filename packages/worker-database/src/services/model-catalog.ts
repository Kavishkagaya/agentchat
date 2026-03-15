import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { modelCatalog } from "../schema";

export async function getModel(params: { orgId: string; providerId: string }) {
  const db = getDb();
  return await db.query.modelCatalog.findFirst({
    where: and(
      eq(modelCatalog.id, params.providerId),
      eq(modelCatalog.orgId, params.orgId),
    ),
  });
}
