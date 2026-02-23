import { randomUUID } from "node:crypto";
import { createGroup, getGroup, getOrgGroups } from "@axon/database";
import { z } from "zod";
import { getOrchestratorClient } from "../../workers/orchestrator";
import { createTRPCRouter, orgProcedure } from "../trpc";

export const groupsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    return getOrgGroups(ctx.auth.orgId);
  }),

  create: orgProcedure
    .input(
      z.object({
        title: z.string().min(1),
        isPrivate: z.boolean().default(false),
        agentIds: z.array(z.string()).default([]),
        memberIds: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const groupId = `group_${randomUUID()}`;

      // 1. Create DB Record (Cold)
      await createGroup({
        groupId,
        orgId: ctx.auth.orgId,
        title: input.title,
        isPrivate: input.isPrivate,
        agentPolicy: {},
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
