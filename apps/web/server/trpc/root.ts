import { createTRPCRouter } from "./trpc";
import { groupsRouter } from "./routers/groups.router";
import { agentsRouter } from "./routers/agents.router";
import { userRouter } from "./routers/user.router";
import { superAdminRouter } from "./routers/super-admin.router";

export const appRouter = createTRPCRouter({
  user: userRouter,
  groups: groupsRouter,
  agents: agentsRouter,
  superAdmin: superAdminRouter,
});

export type AppRouter = typeof appRouter;