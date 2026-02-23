import { getAllGroups } from "@axon/database";
import { createTRPCRouter, superAdminProcedure } from "../trpc";

export const superAdminRouter = createTRPCRouter({
  listAllGroups: superAdminProcedure.query(async () => {
    return getAllGroups();
  }),
});
