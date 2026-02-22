import { createTRPCRouter, protectedProcedure } from "../trpc";
import { getUserOrgRole } from "@axon/database";

export const userRouter = createTRPCRouter({
  me: protectedProcedure
    .query(async ({ ctx }) => {
      // Return user info and role in current org
      const role = ctx.auth.orgId 
        ? await getUserOrgRole(ctx.db, ctx.auth.userId, ctx.auth.orgId)
        : null;

      return {
        userId: ctx.auth.userId,
        orgId: ctx.auth.orgId,
        role: role ?? "member"
      };
    }),
});
