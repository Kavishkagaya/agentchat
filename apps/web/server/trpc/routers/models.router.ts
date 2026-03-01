import {
  createModel,
  deleteModel,
  getModel,
  getSecretMetadata,
  getSystemConfig,
  listModels,
  logAuditEvent,
  setSystemConfig,
  updateModel,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgAdminProcedure, orgProcedure } from "../trpc";

const secretIdSchema = z.string().uuid();

async function fetchCatalog() {
  const stored = await getSystemConfig("provider_catalog");
  // Transform old structure { providers } to new structure { models }
  if (stored && "providers" in stored) {
    return { models: stored.providers };
  }
  return { models: [] };
}

const modelConfigSchema = z.object({
  kind: z.string().min(1),
  model_id: z.string().min(1),
  credentials_ref: z.object({
    secret_id: secretIdSchema,
    version: z.string().default("latest"),
  }),
  enabled: z.boolean().default(true),
});

const modelCatalogEntrySchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  models: z.array(z.string()),
});

export const modelsRouter = createTRPCRouter({
  getCatalog: orgProcedure.query(async () => {
    return await fetchCatalog();
  }),

  updateCatalog: orgAdminProcedure
    .input(z.object({ models: z.array(modelCatalogEntrySchema) }))
    .mutation(async ({ input }) => {
      // Keep storing as { providers } for backward compatibility
      await setSystemConfig("provider_catalog", { providers: input.models });
      return { success: true };
    }),

  list: orgProcedure.query(async ({ ctx }) => {
    if (!ctx.auth.orgId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    const models = await listModels(ctx.auth.orgId);
    return models.map((model) => ({
      id: model.id,
      name: model.name,
      modelType: model.modelType,
      kind: model.kind,
      modelId: model.modelId,
      secretRef: model.secretRef,
      gatewayAccountId: model.gatewayAccountId,
      gatewayId: model.gatewayId,
      config: model.config,
    }));
  }),

  create: orgAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        config: modelConfigSchema,
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
      const modelType = "cloudflare_ai_gateway";

      const fullConfig = {
        model_type: modelType,
        kind: input.config.kind,
        model_id: input.config.model_id,
        credentials_ref: input.config.credentials_ref,
        enabled: input.config.enabled,
      };

      const result = await createModel({
        orgId: ctx.auth.orgId,
        name: input.name,
        modelType,
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
        action: "model.create",
        targetType: "model",
        targetId: result.id,
        metadata: { name: input.name, modelType },
      });

      return result;
    }),

  update: orgAdminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        config: modelConfigSchema.partial().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!(ctx.auth.orgId && ctx.auth.userId)) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const existing = await getModel({
        orgId: ctx.auth.orgId,
        id: input.id,
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
        model_type: existing.modelType,
        kind,
        model_id: modelId,
        credentials_ref: {
          secret_id: secretRef,
          version: "latest",
        },
        enabled: input.config?.enabled ?? true,
      };

      await updateModel({
        orgId: ctx.auth.orgId,
        id: input.id,
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
        action: "model.update",
        targetType: "model",
        targetId: input.id,
        metadata: { name: input.name, modelType: existing.modelType },
      });

      return { ok: true };
    }),

  delete: orgAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!(ctx.auth.orgId && ctx.auth.userId)) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const existing = await getModel({
        orgId: ctx.auth.orgId,
        id: input.id,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await deleteModel({
        orgId: ctx.auth.orgId,
        id: input.id,
      });

      await logAuditEvent({
        orgId: ctx.auth.orgId,
        actorUserId: ctx.auth.userId,
        action: "model.delete",
        targetType: "model",
        targetId: input.id,
        metadata: { name: existing.name, modelType: existing.modelType },
      });

      return { ok: true };
    }),
});
