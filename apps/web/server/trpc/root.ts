import { agentsRouter } from "./routers/agents.router";
import { groupsRouter } from "./routers/groups.router";
import { mcpRouter } from "./routers/mcp.router";
import { providersRouter } from "./routers/providers.router";
import { secretsRouter } from "./routers/secrets.router";
import { superAdminRouter } from "./routers/super-admin.router";
import { userRouter } from "./routers/user.router";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  user: userRouter,
  groups: groupsRouter,
  agents: agentsRouter,
  mcp: mcpRouter,
  providers: providersRouter,
  secrets: secretsRouter,
  superAdmin: superAdminRouter,
});

export type AppRouter = typeof appRouter;
