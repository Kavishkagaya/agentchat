import {
  copyPublicAgent,
  createAgent,
  getAgent,
  getAgents,
  getModel,
  getPublicAgents,
  publishAgent,
  updateAgent,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "../trpc";

const agentConfigSchema = z.object({
  systemPrompt: z.string().min(1),
  model: z.string().min(1).optional(),
  mcpServers: z.array(z.string()).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  stop: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
}).strict();

export const agentsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    return await getAgents(ctx.auth.orgId);
  }),

  get: orgProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const agent = await getAgent(input.agentId, ctx.auth.orgId);
      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }
      return agent;
    }),

  listPublic: orgProcedure.query(async () => {
    const agents = await getPublicAgents();
    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
    }));
  }),

  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        modelId: z.string().min(1),
        config: agentConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const model = await getModel({
        orgId: ctx.auth.orgId,
        id: input.modelId,
      });
      if (!model) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Model not found" });
      }
      if (input.config.model && input.config.model !== model.modelId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Agent config model must not diverge from model catalog model.",
        });
      }

      const result = await createAgent({
        orgId: ctx.auth.orgId,
        name: input.name,
        description: input.description,
        modelId: input.modelId,
        config: {
          ...input.config,
          model: model.modelId,
        },
        createdBy: ctx.auth.userId,
      });
      return result;
    }),

  update: orgProcedure
    .input(
      z.object({
        agentId: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        modelId: z.string().min(1).optional(),
        config: agentConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.modelId) {
        const model = await getModel({
          orgId: ctx.auth.orgId,
          id: input.modelId,
        });
        if (!model) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Model not found",
          });
        }
      }

      return await updateAgent({
        agentId: input.agentId,
        orgId: ctx.auth.orgId,
        name: input.name,
        description: input.description,
        modelId: input.modelId,
        config: input.config,
      });
    }),

  publish: orgProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return await publishAgent({
        orgId: ctx.auth.orgId,
        agentId: input.agentId,
        createdBy: ctx.auth.userId,
      });
    }),

  copyFromPublic: orgProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return await copyPublicAgent({
        orgId: ctx.auth.orgId,
        agentId: input.agentId,
        createdBy: ctx.auth.userId,
      });
    }),
});
