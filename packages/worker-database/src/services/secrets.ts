import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { decryptSecretValue } from "../crypto/secrets";
import { secrets } from "../schema";

export async function getSecretValue(params: {
  encryptionKey?: string;
  orgId: string;
  secretId: string;
}) {
  const db = getDb();
  const record = await db.query.secrets.findFirst({
    where: and(
      eq(secrets.id, params.secretId),
      eq(secrets.orgId, params.orgId),
    ),
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
    value: decryptSecretValue(record.ciphertext, params.encryptionKey),
    version: record.version,
  };
}
