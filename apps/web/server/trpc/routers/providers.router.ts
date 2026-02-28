import {
  createProvider,
  deleteProvider,
  getProvider,
  getSecretMetadata,
  getSystemConfig,
  listProviders,
  logAuditEvent,
  setSystemConfig,
  updateProvider,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgAdminProcedure, orgProcedure } from "../trpc";

const secretIdSchema = z.string().uuid();

async function fetchCatalog() {
  const stored = await getSystemConfig("provider_catalog");
  return stored || { providers: [] };
}

const providerConfigSchema = z.object({
  kind: z.string().min(1),
  model_id: z.string().min(1),
  credentials_ref: z.object({
    secret_id: secretIdSchema,
    version: z.string().default("latest"),
  }),
  enabled: z.boolean().default(true),
});

const providerCatalogEntrySchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  models: z.array(z.string()),
});

export const providersRouter = createTRPCRouter({
  getCatalog: orgProcedure.query(async () => {
    return await fetchCatalog();
  }),

  updateCatalog: orgAdminProcedure
    .input(z.object({ providers: z.array(providerCatalogEntrySchema) }))
    .mutation(async ({ input }) => {
      await setSystemConfig("provider_catalog", { providers: input.providers });
      return { success: true };
    }),

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
      if (!(ctx.auth.orgId && ctx.auth.userId)) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const secret = await getSecretMetadata({
        orgId: ctx.auth.orgId,
        secretId: input.config.credentials_ref.secret_id,
      });
      if (!secret) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Secret not found",
        });
      }

      const gatewayAccountId = process.env.CLOUDFLARE_AIG_ACCOUNT_ID ?? "";
      const gatewayId = process.env.CLOUDFLARE_AIG_GATEWAY_ID ?? "";
      const providerType = "cloudflare_ai_gateway";

      const fullConfig = {
        provider_type: providerType,
        kind: input.config.kind,
        model_id: input.config.model_id,
        credentials_ref: input.config.credentials_ref,
        enabled: input.config.enabled,
      };

      const result = await createProvider({
        orgId: ctx.auth.orgId,
        name: input.name,
        providerType,
        kind: input.config.kind,
        modelId: input.config.model_id,
        secretRef: input.config.credentials_ref.secret_id,
        gatewayAccountId,
        gatewayId,
        config: fullConfig,
        createdBy: ctx.auth.userId || "system",
      });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "provider.create",
        targetType: "provider",
        targetId: result.providerId,
        metadata: { name: input.name, providerType },
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
      if (!(ctx.auth.orgId && ctx.auth.userId)) {
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
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Secret not found",
          });
        }
      }

      const kind = input.config?.kind ?? existing.kind;
      const modelId = input.config?.model_id ?? existing.modelId;
      const secretRef =
        input.config?.credentials_ref?.secret_id ?? existing.secretRef;

      const nextConfig = {
        provider_type: existing.providerType,
        kind,
        model_id: modelId,
        credentials_ref: {
          secret_id: secretRef,
          version: "latest",
        },
        enabled: input.config?.enabled ?? true,
      };

      await updateProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
        name: input.name,
        kind,
        modelId,
        secretRef,
        gatewayAccountId: existing.gatewayAccountId,
        gatewayId: existing.gatewayId,
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
      if (!(ctx.auth.orgId && ctx.auth.userId)) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const existing = await getProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await deleteProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
      });

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
