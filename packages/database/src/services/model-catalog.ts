import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { modelCatalog } from "../schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertSecretId(secretId: string) {
  if (!UUID_PATTERN.test(secretId)) {
    throw new Error("secret_id must be a UUID");
  }
}

export interface CreateModelParams {
  config: Record<string, unknown>;
  createdBy?: string | null;
  gatewayAccountId: string;
  gatewayId: string;
  kind: string;
  modelId: string;
  name: string;
  orgId: string;
  modelType: string;
  secretRef: string;
}

export interface UpdateModelParams {
  config?: Record<string, unknown> | null;
  gatewayAccountId?: string | null;
  gatewayId?: string | null;
  id: string;
  kind?: string | null;
  modelId?: string | null;
  name?: string | null;
  orgId: string;
  secretRef?: string | null;
}

export async function createModel(params: CreateModelParams) {
  assertSecretId(params.secretRef);
  const now = new Date();
  const id = `model_${randomUUID()}`;

  await db.insert(modelCatalog).values({
    id,
    orgId: params.orgId,
    name: params.name,
    modelType: params.modelType,
    kind: params.kind,
    modelId: params.modelId,
    secretRef: params.secretRef,
    gatewayAccountId: params.gatewayAccountId,
    gatewayId: params.gatewayId,
    config: params.config,
    createdBy: params.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return { id, createdAt: now };
}

export async function listModels(orgId: string) {
  return await db.query.modelCatalog.findMany({
    where: eq(modelCatalog.orgId, orgId),
    orderBy: [desc(modelCatalog.updatedAt)],
  });
}

export async function getModel(params: {
  id: string;
  orgId: string;
}) {
  return await db.query.modelCatalog.findFirst({
    where: and(
      eq(modelCatalog.orgId, params.orgId),
      eq(modelCatalog.id, params.id)
    ),
  });
}

export async function updateModel(params: UpdateModelParams) {
  if (params.secretRef !== undefined && params.secretRef !== null) {
    assertSecretId(params.secretRef);
  }

  const now = new Date();
  await db
    .update(modelCatalog)
    .set({
      name: params.name ?? undefined,
      kind: params.kind ?? undefined,
      modelId: params.modelId ?? undefined,
      secretRef: params.secretRef ?? undefined,
      gatewayAccountId: params.gatewayAccountId ?? undefined,
      gatewayId: params.gatewayId ?? undefined,
      config: params.config ?? undefined,
      updatedAt: now,
    })
    .where(
      and(
        eq(modelCatalog.orgId, params.orgId),
        eq(modelCatalog.id, params.id)
      )
    );

  return { updatedAt: now };
}

export async function deleteModel(params: {
  id: string;
  orgId: string;
}) {
  await db
    .delete(modelCatalog)
    .where(
      and(
        eq(modelCatalog.orgId, params.orgId),
        eq(modelCatalog.id, params.id)
      )
    );
}
