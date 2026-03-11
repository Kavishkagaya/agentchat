import { randomUUID } from "node:crypto";
import { createChat, deleteChat, getChat, getOrgChats, updateChat } from "@axon/database";
import { z } from "zod";
import { getOrchestratorClient } from "../../workers/orchestrator";
import { createTRPCRouter, orgProcedure } from "../trpc";

const chatConfigSchema = z
  .object({
    topology: z.enum(["chat", "workflow"]).default("chat"),
    history_mode: z.enum(["internal", "external"]).default("internal"),
    auto: z.boolean().default(true),
    default_agent: z.string().optional(),
    system_prompt: z.string().optional(),
    compaction_threshold: z.number().int().min(10).max(1000).default(50),
    max_tokens: z.number().int().min(1).max(32000).default(4096),
    temperature: z.number().min(0).max(2).default(0.7),
  })
  .passthrough();

function buildDefaultChatConfig() {
  return {
    topology: "chat" as const,
    history_mode: "internal" as const,
    auto: true,
    compaction_threshold: 50,
    max_tokens: 4096,
    temperature: 0.7,
  };
}

export const chatsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    const chats = await getOrgChats(ctx.auth.orgId);
    return chats;
  }),

  create: orgProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        agentIds: z.array(z.string()).default([]),
        config: chatConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chatId = `chat_${randomUUID()}`;
      const config = {
        ...buildDefaultChatConfig(),
        ...input.config,
      };

      // 1. Create in DB
      await createChat({
        chatId,
        orgId: ctx.auth.orgId,
        title: input.title,
        isPrivate: false,
        createdBy: ctx.auth.userId as string,
        memberIds: [ctx.auth.userId as string],
        agentIds: input.agentIds,
        config,
      });

      // 2. Activate Chat Infrastructure (Warm Up)
      const orchestrator = getOrchestratorClient();
      await orchestrator.activateChat({
        config_id: chatId,
        org_id: ctx.auth.orgId,
        user_id: ctx.auth.userId as string,
        history_mode: config.history_mode,
      });

      return { chatId };
    }),

  get: orgProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const chat = await getChat(input.chatId);
      if (!chat) {
        throw new Error("Chat not found");
      }
      return chat;
    }),

  getToken: orgProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orchestrator = getOrchestratorClient();
      return await orchestrator.getRoutingToken({
        config_id: input.chatId,
        user_id: ctx.auth.userId as string,
        role: "owner",
      });
    }),

  getHistory: orgProcedure
    .input(
      z.object({
        chatId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const orchestrator = getOrchestratorClient();
      // Get routing token for client-side use
      const { routing_token } = await orchestrator.getRoutingToken({
        config_id: input.chatId,
        user_id: "system", // Internal fetch doesn't strictly need a user, but orchestrator requires one
        role: "admin",
      });

      return await orchestrator.getChatHistory(input.chatId, routing_token);
    }),

  update: orgProcedure
    .input(
      z.object({
        chatId: z.string(),
        title: z.string().min(1).max(255).optional(),
        agentIds: z.array(z.string()).optional(),
        config: chatConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await updateChat({
        chatId: input.chatId,
        orgId: ctx.auth.orgId,
        title: input.title,
        config: input.config,
        agentIds: input.agentIds,
      });
    }),

  delete: orgProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const chat = await getChat(input.chatId);
      if (!chat) {
        throw new Error("Chat not found");
      }

      // 1. Destroy DO + worker-db records via orchestrator
      const orchestrator = getOrchestratorClient();
      await orchestrator.deleteChat(input.chatId);

      // 2. Delete main DB records
      await deleteChat(input.chatId, ctx.auth.orgId);

      return { deleted: true };
    }),
});