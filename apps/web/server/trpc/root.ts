import { agentsRouter } from "./routers/agents.router";
import { chatsRouter } from "./routers/chats.router";
import { mcpRouter } from "./routers/mcp.router";
import { modelsRouter } from "./routers/models.router";
import { secretsRouter } from "./routers/secrets.router";
import { skillsRouter } from "./routers/skills.router";
import { superAdminRouter } from "./routers/super-admin.router";
import { userRouter } from "./routers/user.router";
import { createTRPCRouter } from "./trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  agents: agentsRouter,
  chats: chatsRouter,
  mcp: mcpRouter,
  models: modelsRouter,
  secrets: secretsRouter,
  skills: skillsRouter,
  superAdmin: superAdminRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
