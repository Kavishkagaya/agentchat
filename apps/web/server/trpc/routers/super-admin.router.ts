import { createTRPCRouter, superAdminProcedure } from "../trpc";
import { getAllGroups } from "@axon/database";

export const superAdminRouter = createTRPCRouter({
  listAllGroups: superAdminProcedure
    .query(async ({ ctx }) => {
      return getAllGroups(ctx.db);
    }),
});
