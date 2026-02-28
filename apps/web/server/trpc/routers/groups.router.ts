import { randomUUID } from "node:crypto";
import { createGroup, getGroup, getOrgGroups } from "@axon/database";
import { z } from "zod";
import { getOrchestratorClient } from "../../workers/orchestrator";
import { createTRPCRouter, orgProcedure } from "../trpc";

const groupConfigSchema = z
  .object({
    history_mode: z.enum(["full", "compact", "external"]).default("full"),
    archive: z
      .object({
        auto_archive_after_days: z.number().int().min(1).max(365).default(7),
        r2_snapshot_on_archive_only: z.boolean().default(true),
        allow_restore: z.boolean().default(true),
      })
      .optional(),
    agent_policy: z
      .object({
        auto_trigger: z.boolean().default(false),
        multi_agent_enabled: z.boolean().default(true),
        max_agent_rounds: z.number().int().min(1).max(10).default(2),
        agent_cooldown_seconds: z.number().int().min(0).max(3600).default(15),
      })
      .optional(),
    runtime: z
      .object({
        max_active_users: z.number().int().min(1).max(500).optional(),
        max_stream_minutes: z.number().int().min(1).max(240).optional(),
      })
      .optional(),
  })
  .strict();

function buildDefaultGroupConfig() {
  return {
    history_mode: "full" as const,
    archive: {
      auto_archive_after_days: 7,
      r2_snapshot_on_archive_only: true,
      allow_restore: true,
    },
    agent_policy: {
      auto_trigger: false,
      multi_agent_enabled: true,
      max_agent_rounds: 2,
      agent_cooldown_seconds: 15,
    },
  };
}

function resolveOrchestratorHistoryMode(
  mode: "compact" | "external" | "full"
): "external" | "internal" {
  return mode === "external" ? "external" : "internal";
}

export const groupsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    const groups = await getOrgGroups(ctx.auth.orgId);
    return groups;
  }),

  create: orgProcedure
    .input(
      z.object({
        title: z.string().min(1),
        isPrivate: z.boolean().default(false),
        agentIds: z.array(z.string()).default([]),
        memberIds: z.array(z.string()).default([]),
        config: groupConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const groupId = `group_${randomUUID()}`;
      const config = {
        ...buildDefaultGroupConfig(),
        ...(input.config ?? {}),
      };

      // 1. Create DB Record (Cold)
      await createGroup({
        groupId,
        orgId: ctx.auth.orgId,
        title: input.title,
        isPrivate: input.isPrivate,
        config,
        createdBy: ctx.auth.userId,
        agentIds: input.agentIds,
        memberIds: [...input.memberIds, ctx.auth.userId],
      });

      // 2. Activate Group Infrastructure (Warm Up)
      const orchestrator = getOrchestratorClient();
      await orchestrator.activateGroup({
        group_id: groupId,
        org_id: ctx.auth.orgId,
        user_id: ctx.auth.userId,
        history_mode: resolveOrchestratorHistoryMode(config.history_mode),
      });

      return { groupId, status: "active" };
    }),

  get: orgProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const group = await getGroup(input.groupId);
      if (!group) {
        throw new Error("Group not found");
      }
      return group;
    }),

  getToken: orgProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const orchestrator = getOrchestratorClient();
      const token = await orchestrator.getRoutingToken({
        group_id: input.groupId,
        user_id: ctx.auth.userId,
      });
      return token;
    }),
});
