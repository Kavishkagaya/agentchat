import {
  createSecret,
  deleteSecret,
  getSecretMetadata,
  getSecretValue,
  listSecrets,
  logAuditEvent,
  updateSecret,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgAdminProcedure } from "../trpc";

export const secretsRouter = createTRPCRouter({
  list: orgAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.auth.orgId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return listSecrets(ctx.auth.orgId);
  }),

  create: orgAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        namespace: z.string().min(1),
        value: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.auth.orgId || !ctx.auth.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const result = await createSecret({
        orgId: ctx.auth.orgId,
        name: input.name,
        namespace: input.namespace,
        value: input.value,
        createdBy: ctx.auth.userId,
      });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "secret.create",
        targetType: "secret",
        targetId: result.secretId,
        metadata: { name: input.name, namespace: input.namespace },
      });

      return result;
    }),

  update: orgAdminProcedure
    .input(
      z.object({
        secretId: z.string().min(1),
        name: z.string().min(1).optional(),
        value: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.auth.orgId || !ctx.auth.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const result = await updateSecret({
        orgId: ctx.auth.orgId,
        secretId: input.secretId,
        name: input.name,
        value: input.value,
        rotatedBy: ctx.auth.userId,
      });

      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "secret.update",
        targetType: "secret",
        targetId: input.secretId,
        metadata: { name: input.name, rotated: Boolean(input.value) },
      });

      return result;
    }),

  delete: orgAdminProcedure
    .input(z.object({ secretId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.auth.orgId || !ctx.auth.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const existing = await getSecretMetadata({
        orgId: ctx.auth.orgId,
        secretId: input.secretId,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await deleteSecret({ orgId: ctx.auth.orgId, secretId: input.secretId });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "secret.delete",
        targetType: "secret",
        targetId: input.secretId,
        metadata: { name: existing.name },
      });

      return { ok: true };
    }),

  reveal: orgAdminProcedure
    .input(z.object({ secretId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.auth.orgId || !ctx.auth.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const secret = await getSecretValue({
        orgId: ctx.auth.orgId,
        secretId: input.secretId,
      });

      if (!secret) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "secret.reveal",
        targetType: "secret",
        targetId: input.secretId,
      });

      return secret;
    }),
});
