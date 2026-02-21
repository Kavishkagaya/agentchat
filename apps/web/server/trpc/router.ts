import { randomUUID } from "node:crypto";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { eq, desc, inArray } from "drizzle-orm";
import {
  chats,
  orgs,
  chatAgents,
  sandboxes,
  chatArchives,
  agents,
  chatRuntime,
  chatAgentRuntimes,
  agentRuntimes
} from "@agentchat/db";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson
});

export const publicProcedure = t.procedure;

const normalizeAgentConfig = (agentId: string, config: Record<string, unknown>) => {
  const systemPrompt =
    (config.systemPrompt as string | undefined) ?? (config.system_prompt as string | undefined);
  const model = (config.model as string | undefined) ?? "gpt-4o-mini";
  return {
    agent_id: agentId,
    system_prompt: systemPrompt,
    model,
    provider: (config.provider as string | undefined) ?? "openai",
    tools: config.tools,
    temperature: config.temperature,
    max_tokens: config.maxTokens ?? config.max_tokens,
    top_p: config.topP ?? config.top_p,
    presence_penalty: config.presencePenalty ?? config.presence_penalty,
    frequency_penalty: config.frequencyPenalty ?? config.frequency_penalty,
    stop: config.stop,
    seed: config.seed
  };
};

const ensureOrg = async (ctx: Context, orgId: string) => {
  const existing = await ctx.db.query.orgs.findFirst({
    where: (orgsTable, { eq: eqFn }) => eqFn(orgsTable.orgId, orgId)
  });
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  await ctx.db.insert(orgs).values({
    orgId,
    name: `Org ${orgId}`,
    planId: "free",
    createdAt: now,
    updatedAt: now
  });
  return ctx.db.query.orgs.findFirst({
    where: (orgsTable, { eq: eqFn }) => eqFn(orgsTable.orgId, orgId)
  });
};

const chatRouter = t.router({
  list: publicProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.chats.findMany({
        where: (chatsTable, { eq: eqFn }) => eqFn(chatsTable.orgId, input.orgId),
        orderBy: (chatsTable, { desc: descFn }) => [descFn(chatsTable.updatedAt)]
      });
      return rows;
    }),
  get: publicProcedure
    .input(z.object({ chatId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const chat = await ctx.db.query.chats.findFirst({
        where: (chatsTable, { eq: eqFn }) => eqFn(chatsTable.chatId, input.chatId)
      });
      if (!chat) {
        return null;
      }
      const agents = await ctx.db.query.chatAgents.findMany({
        where: (chatAgentsTable, { eq: eqFn }) => eqFn(chatAgentsTable.chatId, input.chatId)
      });
      return { chat, agents: agents.map((entry) => entry.agentId) };
    }),
  create: publicProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        title: z.string().min(1),
        isPrivate: z.boolean().optional(),
        agentIds: z.array(z.string()).optional(),
        createdBy: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureOrg(ctx, input.orgId);
      const now = new Date().toISOString();
      const chatId = `chat_${randomUUID()}`;
      await ctx.db.insert(chats).values({
        chatId,
        orgId: input.orgId,
        title: input.title,
        status: "active",
        isPrivate: input.isPrivate ?? false,
        agentPolicy: {},
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now
      });

      await ctx.db.insert(chatRuntime).values({
        chatId,
        chatControllerId: chatId,
        status: "idle",
        activeSandboxCount: 0,
        lastActiveAt: now
      });

      if (input.agentIds?.length) {
        await ctx.db.insert(chatAgents).values(
          input.agentIds.map((agentId) => ({
            chatId,
            agentId,
            createdAt: now
          }))
        );

        const agentConfigs = await ctx.db.query.agents.findMany({
          where: (agentsTable, { inArray: inArrayFn }) =>
            inArrayFn(agentsTable.agentId, input.agentIds ?? [])
        });
        const configMap = new Map(agentConfigs.map((entry) => [entry.agentId, entry.config]));
        for (const agentId of input.agentIds) {
          const rawConfig = (configMap.get(agentId) ?? {}) as Record<string, unknown>;
          const agentPayload = normalizeAgentConfig(agentId, rawConfig);
          await ctx.orchestrator.createAgentRuntime({
            chat_id: chatId,
            agent_id: agentId,
            agent: agentPayload
          });
        }
      }

      return { chatId, status: "active", createdAt: now };
    }),
  addMessage: publicProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        text: z.string().min(1),
        agentPolicy: z.record(z.unknown()).optional(),
        toolIntent: z.record(z.unknown()).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const messageId = `msg_${randomUUID()}`;

      const runtimeLinks = await ctx.db.query.chatAgentRuntimes.findMany({
        where: (chatAgentRuntimesTable, { eq: eqFn }) =>
          eqFn(chatAgentRuntimesTable.chatId, input.chatId)
      });
      const runtimeIds = runtimeLinks.map((entry) => entry.runtimeId);
      const runtimeRecords = runtimeIds.length
        ? await ctx.db.query.agentRuntimes.findMany({
            where: (agentRuntimesTable, { inArray: inArrayFn }) =>
              inArrayFn(agentRuntimesTable.runtimeId, runtimeIds)
          })
        : [];
      const runtimeMap = new Map(runtimeRecords.map((entry) => [entry.runtimeId, entry]));
      const agentRuntimesPayload = runtimeLinks
        .map((link) => {
          const runtime = runtimeMap.get(link.runtimeId);
          if (!runtime) {
            return undefined;
          }
          return {
            agent_id: link.agentId,
            runtime_id: runtime.runtimeId,
            base_url: runtime.baseUrl
          };
        })
        .filter(Boolean) as Array<{ agent_id: string; runtime_id: string; base_url: string }>;

      await ctx.chatController.postMessage({
        chat_id: input.chatId,
        message_id: messageId,
        text: input.text,
        agent_runtimes: agentRuntimesPayload
      });

      await ctx.db
        .update(chats)
        .set({ updatedAt: now, lastActiveAt: now })
        .where(eq(chats.chatId, input.chatId));
      await ctx.db
        .update(chatRuntime)
        .set({ lastActiveAt: now, status: "active" })
        .where(eq(chatRuntime.chatId, input.chatId));

      return { messageId, status: "queued", streamChannelId: `stream_${messageId}` };
    }),
  messages: publicProcedure
    .input(z.object({ chatId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const response = await ctx.chatController.listMessages(input.chatId);
      return response.messages;
    }),
  approveSandbox: publicProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        decision: z.enum(["reuse", "new"]),
        templateId: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.sandboxes.findFirst({
        where: (sandboxesTable, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(sandboxesTable.chatId, input.chatId), eqFn(sandboxesTable.status, "running")),
        orderBy: (sandboxesTable, { desc: descFn }) => [descFn(sandboxesTable.updatedAt)]
      });

      if (input.decision === "reuse" && existing) {
        return {
          sandboxId: existing.sandboxId,
          previewUrl: existing.previewHost.startsWith("http")
            ? existing.previewHost
            : `https://${existing.previewHost}`,
          status: existing.status
        };
      }

      const orchestrator = ctx.orchestrator;
      const response = await orchestrator.createSandbox({
        chat_id: input.chatId,
        template_id: input.templateId,
        idempotency_key: `sandbox_${randomUUID()}`
      });

      const now = new Date().toISOString();
      const previewUrl = response.preview_host.startsWith("http")
        ? response.preview_host
        : `https://${response.preview_host}`;

      await ctx.db.insert(sandboxes).values({
        sandboxId: response.sandbox_id,
        chatId: input.chatId,
        status: response.status,
        previewHost: response.preview_host,
        templateId: input.templateId,
        sandboxEpoch: response.sandbox_epoch ?? 0,
        createdAt: now,
        updatedAt: now
      });

      return {
        sandboxId: response.sandbox_id,
        previewUrl,
        status: response.status
      };
    }),
  archive: publicProcedure
    .input(z.object({ chatId: z.string().min(1), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const snapshotId = `snap_${randomUUID()}`;
      const archiveId = `arch_${randomUUID()}`;
      const r2Path = `archives/${input.chatId}/${snapshotId}/snapshot.json`;

      await ctx.db
        .update(chats)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(eq(chats.chatId, input.chatId));
      await ctx.db.update(chatRuntime).set({ status: "archived" }).where(eq(chatRuntime.chatId, input.chatId));

      await ctx.db.insert(chatArchives).values({
        archiveId,
        chatId: input.chatId,
        snapshotId,
        r2Path,
        createdAt: now
      });

      return { archivedAt: now, r2Path };
    })
});

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
        parameters: z.record(z.unknown()).optional(),
        config: z.record(z.unknown()).optional()
      })
    )
    .optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  stop: z.array(z.string()).optional(),
  seed: z.number().int().optional()
});

const agentRouter = t.router({
  list: publicProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.agents.findMany({
        where: (agentsTable, { eq: eqFn }) => eqFn(agentsTable.orgId, input.orgId),
        orderBy: (agentsTable, { desc: descFn }) => [descFn(agentsTable.updatedAt)]
      });
    }),
  create: publicProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        config: agentConfigSchema
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const agentId = `agent_${randomUUID()}`;
      await ctx.db.insert(agents).values({
        agentId,
        orgId: input.orgId,
        name: input.name,
        description: input.description,
        config: input.config,
        createdAt: now,
        updatedAt: now
      });
      return { agentId, createdAt: now };
    })
});

export const appRouter = t.router({
  chat: chatRouter,
  agent: agentRouter
});

export type AppRouter = typeof appRouter;
