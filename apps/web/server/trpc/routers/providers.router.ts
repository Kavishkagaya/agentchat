import {
  createProvider,
  deleteProvider,
  getProvider,
  getSecretMetadata,
  listProviders,
  logAuditEvent,
  updateProvider,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgAdminProcedure, orgProcedure } from "../trpc";

const providerInput = z.object({
  name: z.string().min(1),
  providerType: z.string().min(1),
  kind: z.string().min(1),
  modelId: z.string().min(1),
  secretRef: z.string().min(1),
  gatewayAccountId: z.string().min(1),
  gatewayId: z.string().min(1),
});

export const providersRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    const providers = await listProviders(ctx.auth.orgId);
    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      providerType: provider.providerType,
      kind: provider.kind,
      modelId: provider.modelId,
      secretRef: provider.secretRef,
      gatewayAccountId: provider.gatewayAccountId,
      gatewayId: provider.gatewayId,
    }));
  }),

  create: orgAdminProcedure
    .input(providerInput)
    .mutation(async ({ ctx, input }) => {
      const secret = await getSecretMetadata({
        orgId: ctx.auth.orgId,
        secretId: input.secretRef,
      });
      if (!secret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Secret not found" });
      }

      const result = await createProvider({
        orgId: ctx.auth.orgId,
        name: input.name,
        providerType: input.providerType,
        kind: input.kind,
        modelId: input.modelId,
        secretRef: input.secretRef,
        gatewayAccountId: input.gatewayAccountId,
        gatewayId: input.gatewayId,
        createdBy: ctx.auth.userId,
      });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "provider.create",
        targetType: "provider",
        targetId: result.providerId,
        metadata: { name: input.name, providerType: input.providerType },
      });

      return result;
    }),

  update: orgAdminProcedure
    .input(
      z.object({
        providerId: z.string().min(1),
        name: z.string().min(1).optional(),
        kind: z.string().min(1).optional(),
        modelId: z.string().min(1).optional(),
        secretRef: z.string().min(1).optional(),
        gatewayAccountId: z.string().min(1).optional(),
        gatewayId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (input.secretRef) {
        const secret = await getSecretMetadata({
          orgId: ctx.auth.orgId,
          secretId: input.secretRef,
        });
        if (!secret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Secret not found" });
        }
      }

      await updateProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
        name: input.name,
        kind: input.kind,
        modelId: input.modelId,
        secretRef: input.secretRef,
        gatewayAccountId: input.gatewayAccountId,
        gatewayId: input.gatewayId,
      });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "provider.update",
        targetType: "provider",
        targetId: input.providerId,
        metadata: { name: input.name, providerType: existing.providerType },
      });

      return { ok: true };
    }),

  delete: orgAdminProcedure
    .input(z.object({ providerId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await deleteProvider({ orgId: ctx.auth.orgId, providerId: input.providerId });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "provider.delete",
        targetType: "provider",
        targetId: input.providerId,
        metadata: { name: existing.name, providerType: existing.providerType },
      });

      return { ok: true };
    }),
});
