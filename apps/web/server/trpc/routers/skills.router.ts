import {
  createSkill,
  deleteSkill,
  getSkill,
  getSkills,
  updateSkill,
} from "@axon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, orgProcedure } from "../trpc";

export const skillsRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    return await getSkills(ctx.auth.orgId);
  }),

  get: orgProcedure
    .input(z.object({ skillId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const skill = await getSkill(input.skillId, ctx.auth.orgId);
      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
      }
      return skill;
    }),

  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await createSkill({
        orgId: ctx.auth.orgId,
        name: input.name,
        description: input.description,
        content: input.content,
      });
    }),

  update: orgProcedure
    .input(
      z.object({
        skillId: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        content: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateSkill({
          skillId: input.skillId,
          orgId: ctx.auth.orgId,
          name: input.name,
          description: input.description,
          content: input.content,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof Error && error.message === "Skill not found") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Skill not found",
          });
        }
        throw error;
      }
    }),

  delete: orgProcedure
    .input(z.object({ skillId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteSkill(input.skillId, ctx.auth.orgId);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof Error && error.message === "Skill not found") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Skill not found",
          });
        }
        throw error;
      }
    }),
});
