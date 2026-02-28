import { getMe } from "@axon/database";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const { userId, orgId } = ctx.auth;

    const axonUser = await getMe(userId, orgId);

    return axonUser;
  }),
});
