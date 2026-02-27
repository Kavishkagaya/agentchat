import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { secrets } from "../schema";
import { decryptSecretValue, encryptSecretValue } from "../crypto/secrets";

export interface CreateSecretParams {
  orgId: string;
  name: string;
  namespace: string;
  value: string;
  createdBy?: string | null;
}

export interface UpdateSecretParams {
  orgId: string;
  secretId: string;
  name?: string | null;
  value?: string | null;
  rotatedBy?: string | null;
}

export async function createSecret(params: CreateSecretParams) {
  const now = new Date();
  const id = randomUUID();
  const ciphertext = encryptSecretValue(params.value);

  await db.insert(secrets).values({
    id,
    orgId: params.orgId,
    name: params.name,
    namespace: params.namespace,
    ciphertext,
    version: 1,
    createdBy: params.createdBy ?? null,
    createdAt: now,
    rotatedAt: now,
  });

  return { secretId: id, createdAt: now };
}

export async function listSecrets(orgId: string) {
  return await db.query.secrets.findMany({
    where: eq(secrets.orgId, orgId),
    orderBy: [desc(secrets.createdAt)],
    columns: {
      id: true,
      orgId: true,
      name: true,
      namespace: true,
      version: true,
      createdAt: true,
      rotatedAt: true,
    },
  });
}

export async function getSecretMetadata(params: { orgId: string; secretId: string }) {
  return await db.query.secrets.findFirst({
    where: and(eq(secrets.id, params.secretId), eq(secrets.orgId, params.orgId)),
    columns: {
      id: true,
      orgId: true,
      name: true,
      namespace: true,
      version: true,
      createdAt: true,
      rotatedAt: true,
    },
  });
}

export async function getSecretValue(params: { orgId: string; secretId: string }) {
  const record = await db.query.secrets.findFirst({
    where: and(eq(secrets.id, params.secretId), eq(secrets.orgId, params.orgId)),
    columns: {
      id: true,
      orgId: true,
      ciphertext: true,
      version: true,
    },
  });

  if (!record) {
    return null;
  }

  return {
    secretId: record.id,
    orgId: record.orgId,
    value: decryptSecretValue(record.ciphertext),
    version: record.version,
  };
}

export async function updateSecret(params: UpdateSecretParams) {
  const now = new Date();
  const existing = await db.query.secrets.findFirst({
    where: and(eq(secrets.id, params.secretId), eq(secrets.orgId, params.orgId)),
  });

  if (!existing) {
    return null;
  }

  const nextValues: Record<string, unknown> = {};

  if (params.name) {
    nextValues.name = params.name;
  }

  if (params.value) {
    nextValues.ciphertext = encryptSecretValue(params.value);
    nextValues.rotatedAt = now;
    nextValues.version = (existing.version ?? 0) + 1;
  }

  if (!Object.keys(nextValues).length) {
    return { updatedAt: now, version: existing.version };
  }

  await db
    .update(secrets)
    .set(nextValues)
    .where(and(eq(secrets.id, params.secretId), eq(secrets.orgId, params.orgId)));

  return {
    updatedAt: now,
    version: (nextValues.version as number | undefined) ?? existing.version,
  };
}

export async function deleteSecret(params: { orgId: string; secretId: string }) {
  await db
    .delete(secrets)
    .where(and(eq(secrets.id, params.secretId), eq(secrets.orgId, params.orgId)));
}
