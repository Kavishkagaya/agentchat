import { randomUUID } from "node:crypto";
import { db } from "../client";
import { auditLog } from "../schema";

export interface AuditLogParams {
  orgId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logAuditEvent(params: AuditLogParams) {
  const now = new Date();
  const id = `audit_${randomUUID()}`;

  await db.insert(auditLog).values({
    id,
    orgId: params.orgId ?? null,
    actorUserId: params.actorUserId ?? null,
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    metadata: params.metadata ?? null,
    createdAt: now,
  });

  return { auditId: id, createdAt: now };
}
