import { createTRPCRouter, protectedProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const { userId, orgId } = ctx.auth;

    // Fetch user details using internal ID
    const user = await ctx.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });

    if (!user) {
      return null;
    }

    let organization = null;
    let membership = null;

    if (orgId) {
      // Fetch organization and membership in parallel using internal IDs
      const [orgResult, memberResult] = await Promise.all([
        ctx.db.query.orgs.findFirst({
          where: (orgs, { eq }) => eq(orgs.id, orgId),
        }),
        ctx.db.query.orgMembers.findFirst({
          where: (members, { and, eq }) =>
            and(eq(members.userId, userId), eq(members.orgId, orgId)),
        }),
      ]);
      organization = orgResult;
      membership = memberResult;
    }

    return {
      ...user,
      organization: organization
        ? {
            ...organization,
            role: membership?.role ?? "member",
          }
        : null,
    };
  }),
});
