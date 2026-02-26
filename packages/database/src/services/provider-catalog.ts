import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { providerCatalog } from "../schema";

export interface CreateProviderParams {
  orgId: string;
  name: string;
  providerType: string;
  kind: string;
  modelId: string;
  secretRef: string;
  gatewayAccountId: string;
  gatewayId: string;
  createdBy?: string | null;
}

export interface UpdateProviderParams {
  orgId: string;
  providerId: string;
  name?: string | null;
  kind?: string | null;
  modelId?: string | null;
  secretRef?: string | null;
  gatewayAccountId?: string | null;
  gatewayId?: string | null;
}

export async function createProvider(params: CreateProviderParams) {
  const now = new Date();
  const id = `provider_${randomUUID()}`;

  await db.insert(providerCatalog).values({
    id,
    orgId: params.orgId,
    name: params.name,
    providerType: params.providerType,
    kind: params.kind,
    modelId: params.modelId,
    secretRef: params.secretRef,
    gatewayAccountId: params.gatewayAccountId,
    gatewayId: params.gatewayId,
    createdBy: params.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return { providerId: id, createdAt: now };
}

export async function listProviders(orgId: string) {
  return await db.query.providerCatalog.findMany({
    where: eq(providerCatalog.orgId, orgId),
    orderBy: [desc(providerCatalog.updatedAt)],
  });
}

export async function getProvider(params: { orgId: string; providerId: string }) {
  return await db.query.providerCatalog.findFirst({
    where: and(
      eq(providerCatalog.orgId, params.orgId),
      eq(providerCatalog.id, params.providerId)
    ),
  });
}

export async function updateProvider(params: UpdateProviderParams) {
  const now = new Date();
  await db
    .update(providerCatalog)
    .set({
      name: params.name ?? undefined,
      kind: params.kind ?? undefined,
      modelId: params.modelId ?? undefined,
      secretRef: params.secretRef ?? undefined,
      gatewayAccountId: params.gatewayAccountId ?? undefined,
      gatewayId: params.gatewayId ?? undefined,
      updatedAt: now,
    })
    .where(
      and(
        eq(providerCatalog.orgId, params.orgId),
        eq(providerCatalog.id, params.providerId)
      )
    );

  return { updatedAt: now };
}

export async function deleteProvider(params: { orgId: string; providerId: string }) {
  await db
    .delete(providerCatalog)
    .where(
      and(
        eq(providerCatalog.orgId, params.orgId),
        eq(providerCatalog.id, params.providerId)
      )
    );
}
