import { initDb } from "@axon/worker-database";
import type { Env } from "./env";
import { validateEnv } from "./env";
import {
  handleAgentRun,
  handleAgentRunDev,
  handleAgentRunDevStream,
  handleAgentRunStream,
} from "./handlers";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      validateEnv(env);
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "invalid worker configuration",
        },
        { status: 500 },
      );
    }

    initDb(env.DATABASE_URL);
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "agents",
        env: env.ENVIRONMENT,
      });
    }

    if (request.method === "POST" && url.pathname === "/agents/run") {
      try {
        return await handleAgentRun(request, env);
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "agent error",
          },
          { status: 400 },
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/agents/run-stream") {
      return handleAgentRunStream(request, env);
    }

    if (request.method === "POST" && url.pathname === "/agents/run-dev") {
      return handleAgentRunDev(request, env);
    }

    if (request.method === "POST" && url.pathname === "/agents/run-dev-stream") {
      return handleAgentRunDevStream(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};
