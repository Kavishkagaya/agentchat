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

const secretIdSchema = z.string().uuid();

const providerConfigSchema = z.object({
  provider_type: z.string().min(1),
  kind: z.string().min(1),
  model_id: z.string().min(1),
  credentials_ref: z.object({
    secret_id: secretIdSchema,
    version: z.string().default("latest"),
  }),
  gateway: z
    .object({
      account_id: z.string().min(1),
      gateway_id: z.string().min(1),
    })
    .optional(),
  enabled: z.boolean().default(true),
}).strict();

export const providersRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    if (!ctx.auth.orgId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
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
      config: provider.config,
    }));
  }),

  create: orgAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        config: providerConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.auth.orgId || !ctx.auth.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const secret = await getSecretMetadata({
        orgId: ctx.auth.orgId,
        secretId: input.config.credentials_ref.secret_id,
      });
      if (!secret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Secret not found" });
      }

      const gatewayAccountId = input.config.gateway?.account_id ?? "";
      const gatewayId = input.config.gateway?.gateway_id ?? "";
      const result = await createProvider({
        orgId: ctx.auth.orgId,
        name: input.name,
        providerType: input.config.provider_type,
        kind: input.config.kind,
        modelId: input.config.model_id,
        secretRef: input.config.credentials_ref.secret_id,
        gatewayAccountId,
        gatewayId,
        config: input.config,
        createdBy: ctx.auth.userId,
      });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "provider.create",
        targetType: "provider",
        targetId: result.providerId,
        metadata: { name: input.name, providerType: input.config.provider_type },
      });

      return result;
    }),

  update: orgAdminProcedure
    .input(
      z.object({
        providerId: z.string().min(1),
        name: z.string().min(1).optional(),
        config: providerConfigSchema.partial().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.auth.orgId || !ctx.auth.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const existing = await getProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (input.config?.credentials_ref?.secret_id) {
        const secret = await getSecretMetadata({
          orgId: ctx.auth.orgId,
          secretId: input.config.credentials_ref.secret_id,
        });
        if (!secret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Secret not found" });
        }
      }

      const nextConfig = {
        ...(existing.config as Record<string, unknown>),
        ...(input.config ?? {}),
      };
      const providerType =
        (nextConfig.provider_type as string | undefined) ?? existing.providerType;
      const kind = (nextConfig.kind as string | undefined) ?? existing.kind;
      const modelId = (nextConfig.model_id as string | undefined) ?? existing.modelId;
      const secretRef =
        ((nextConfig.credentials_ref as { secret_id?: string } | undefined)?.secret_id ??
          existing.secretRef) as string;
      const gateway = nextConfig.gateway as
        | { account_id?: string; gateway_id?: string }
        | undefined;

      await updateProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
        name: input.name,
        kind,
        modelId,
        secretRef,
        gatewayAccountId: gateway?.account_id ?? existing.gatewayAccountId,
        gatewayId: gateway?.gateway_id ?? existing.gatewayId,
        config: nextConfig,
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
      if (!ctx.auth.orgId || !ctx.auth.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
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
