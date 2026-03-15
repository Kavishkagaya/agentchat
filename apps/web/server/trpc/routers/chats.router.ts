import { randomUUID } from "node:crypto";
import {
  createChat,
  deleteChat,
  getChat,
  getOrgChats,
  updateChat,
} from "@axon/database";
import {
  buildChatConfig,
  type ChatRoutingConfig,
  chatConfigPatchSchema,
  chatCreateInputSchema,
  chatUpdateInputSchema,
  normalizeChatRoutingConfig,
} from "@axon/shared";
import { z } from "zod";
import { getOrchestratorClient } from "../../workers/orchestrator";
import { createTRPCRouter, orgProcedure } from "../trpc";

export const chatsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    const chats = await getOrgChats(ctx.auth.orgId);
    return chats;
  }),

  create: orgProcedure
    .input(chatCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const chatId = `chat_${randomUUID()}`;
      const config = buildChatConfig({
        config: input.config,
        agentSetup: input.agentSetup,
      });
      const agentIds = input.agentSetup.map((agent) => agent.agentId);

      // 1. Create in DB
      await createChat({
        chatId,
        orgId: ctx.auth.orgId,
        title: input.title,
        isPrivate: false,
        createdBy: ctx.auth.userId as string,
        memberIds: [ctx.auth.userId as string],
        agentIds,
        config,
      });

      // 2. Activate Chat Infrastructure (Warm Up)
      const orchestrator = getOrchestratorClient();
      await orchestrator.activateChat(
        { config_id: chatId },
        { org_id: ctx.auth.orgId, sub: ctx.auth.userId as string },
      );

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
      return await orchestrator.getRoutingToken(
        { config_id: input.chatId, role: "owner" },
        { sub: ctx.auth.userId as string },
      );
    }),

  getHistory: orgProcedure
    .input(
      z.object({
        chatId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const orchestrator = getOrchestratorClient();
      // Get routing token for client-side use
      const { routing_token } = await orchestrator.getRoutingToken(
        { config_id: input.chatId, role: "admin" },
        { sub: "system" },
      );

      return await orchestrator.getChatHistory(input.chatId, routing_token);
    }),

  update: orgProcedure
    .input(
      z.object({
        chatId: z.string(),
        title: z.string().min(1).max(255).optional(),
        agentSetup: chatUpdateInputSchema.shape.agentSetup,
        agentIds: z.array(z.string()).optional(),
        config: chatConfigPatchSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let configToPersist: ChatRoutingConfig | undefined;
      let agentIdsToPersist: string[] | undefined;

      if (input.config || input.agentSetup || input.agentIds) {
        const existing = await getChat(input.chatId);
        if (!existing || existing.orgId !== ctx.auth.orgId) {
          throw new Error("Chat not found");
        }

        const existingConfig = normalizeChatRoutingConfig(
          (existing.config as Record<string, unknown> | undefined) ?? {},
        );
        const nextAgentSetup =
          input.agentSetup ??
          (input.agentIds
            ? input.agentIds.map((agentId) => ({
                agentId,
                nickname: `agent_${agentId.slice(-6).toLowerCase()}`,
                responsibility: "General assistance for this chat.",
              }))
            : existingConfig.agent_setups);
        const mergedConfig = {
          ...existingConfig,
          ...input.config,
        };
        if (
          mergedConfig.auto === true &&
          (!mergedConfig.default_agent ||
            !nextAgentSetup.some(
              (agent) => agent.agentId === mergedConfig.default_agent,
            ))
        ) {
          mergedConfig.default_agent = nextAgentSetup[0]?.agentId;
        }

        configToPersist = buildChatConfig({
          config: mergedConfig,
          agentSetup: nextAgentSetup,
        });
        agentIdsToPersist = nextAgentSetup.map((agent) => agent.agentId);
      }

      const result = await updateChat({
        chatId: input.chatId,
        orgId: ctx.auth.orgId,
        title: input.title,
        config: configToPersist,
        agentIds: agentIdsToPersist,
      });

      // Sync config to Memory Controller (best-effort, don't block on failure)
      if (configToPersist) {
        try {
          const orchestrator = getOrchestratorClient();
          await orchestrator.syncConfig(input.chatId, configToPersist as Record<string, unknown>);
        } catch (err) {
          console.error("Failed to sync config to memory controller:", err);
          // Non-fatal: next /init or restart will pick up the DB config
        }
      }

      return result;
    }),

  clearHistory: orgProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      const orchestrator = getOrchestratorClient();
      return await orchestrator.clearHistory(input.chatId);
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
