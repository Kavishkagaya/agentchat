import { createAgent, getAgents } from "@axon/database";
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "../trpc";

const agentConfigSchema = z.object({
  systemPrompt: z.string().min(1),
  model: z.string().min(1),
  provider: z.literal("openai").optional(),
  tools: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        parameters: z.record(z.string(), z.unknown()).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
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

  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        config: agentConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await createAgent({
        orgId: ctx.auth.orgId,
        name: input.name,
        description: input.description,
        config: input.config,
        createdBy: ctx.auth.userId,
      });
      return result;
    }),
});
