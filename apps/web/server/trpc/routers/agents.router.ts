import {
  copyPublicAgent,
  createAgent,
  getProvider,
  getAgents,
  getPublicAgents,
  publishAgent,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "../trpc";

const mcpToolRefSchema = z.object({
  serverId: z.string().min(1),
  toolId: z.string().min(1),
  name: z.string().min(1),
});

const agentConfigSchema = z.object({
  systemPrompt: z.string().min(1),
  model: z.string().min(1),
  tools: z.array(mcpToolRefSchema).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  stop: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
});

export const agentsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    return getAgents(ctx.auth.orgId);
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
        providerId: z.string().min(1),
        config: agentConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = await getProvider({
        orgId: ctx.auth.orgId,
        providerId: input.providerId,
      });
      if (!provider) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Provider not found" });
      }

      const result = await createAgent({
        orgId: ctx.auth.orgId,
        name: input.name,
        description: input.description,
        providerId: input.providerId,
        config: {
          ...input.config,
          model: provider.modelId,
        },
        createdBy: ctx.auth.userId,
      });
      return result;
    }),

  publish: orgProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return publishAgent({
        orgId: ctx.auth.orgId,
        agentId: input.agentId,
        createdBy: ctx.auth.userId,
      });
    }),

  copyFromPublic: orgProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return copyPublicAgent({
        orgId: ctx.auth.orgId,
        agentId: input.agentId,
        createdBy: ctx.auth.userId,
      });
    }),
});
