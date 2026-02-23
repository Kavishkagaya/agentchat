import { agentsRouter } from "./routers/agents.router";
import { groupsRouter } from "./routers/groups.router";
import { superAdminRouter } from "./routers/super-admin.router";
import { userRouter } from "./routers/user.router";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  user: userRouter,
  groups: groupsRouter,
  agents: agentsRouter,
  superAdmin: superAdminRouter,
});

export type AppRouter = typeof appRouter;
