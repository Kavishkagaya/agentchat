import { getDb, initDb, schema } from "@axon/worker-database";
import { eq } from "drizzle-orm";
import { MultiAgentHandler } from "./multi/handler";
import { SingleAgentHandler } from "./single/handler";
import { WorkflowHandler } from "./workflow/handler";

export interface Env {
  AGENTS_BASE_URL?: string;
  MEMORY_CONTROLLER: DurableObjectNamespace;
  ENVIRONMENT: string;
  GC_PRIVATE_KEY: string;
  ORCHESTRATOR_SERVICE_TOKEN?: string;
  DATABASE_URL?: string;
}

type InitRequest = {
  config_id: string;
  type: "single" | "multi" | "workflow";
  org_id?: string;
  config?: any;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hasOrchestratorToken(request: Request, env: Env) {
  if (
    env.ENVIRONMENT === "dev" &&
    new URL(request.url).pathname.startsWith("/dev")
  ) {
    return true; // Bypass for dev routes
  }
  if (!env.ORCHESTRATOR_SERVICE_TOKEN) {
    return true;
  }
  return (
    request.headers.get("x-orchestrator-service-token") ===
    env.ORCHESTRATOR_SERVICE_TOKEN
  );
}

function pathSuffix(pathname: string): string {
  const chatsPrefix = /^\/chats\/[^/]+/;
  const devPrefix = /^\/dev\/[^/]+/;
  if (chatsPrefix.test(pathname)) {
    const stripped = pathname.replace(chatsPrefix, "");
    return stripped.length > 0 ? stripped : "/";
  }
  if (devPrefix.test(pathname)) {
    const stripped = pathname.replace(devPrefix, "");
    return stripped.length > 0 ? stripped : "/";
  }
  return pathname;
}

import { DurableObject } from "cloudflare:workers";

export class MemoryController extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (!hasOrchestratorToken(request, this.env)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const route = pathSuffix(url.pathname);

    if (request.method === "POST" && route === "/archive") {
      try {
        const sql = this.ctx.storage.sql;
        if (!sql) throw new Error("SQLite storage not available");

        let body: any;
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        // Get all table names
        const tableNames = Array.from(
          sql.exec<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          ),
        ).map((row) => row.name);

        // Export all tables as JSON objects
        const tables: Record<string, unknown[]> = {};
        for (const tableName of tableNames) {
          const rows = Array.from(sql.exec(`SELECT * FROM ${tableName}`));
          tables[tableName] = rows;
        }

        return json({
          ok: true,
          snapshot: {
            reason: body.reason,
            tables,
            archived_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        return json(
          {
            ok: false,
            error: err instanceof Error ? err.message : "archive failed",
          },
          500,
        );
      }
    }

    if (request.method === "POST" && route === "/init") {
      let body: InitRequest;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }

      if (!body.config_id) {
        return json({ ok: false, error: "missing config_id" }, 400);
      }

      let config = body.config;
      let type = body.type;
      let org_id = body.org_id;

      if (!config || !type) {
        // Fetch from Postgres if not provided
        if (this.env.DATABASE_URL) {
          try {
            initDb(this.env.DATABASE_URL);
            const db = getDb();
            const results = await db
              .select()
              .from(schema.configs)
              .where(eq(schema.configs.id, body.config_id))
              .limit(1);
            const groupRecord = results[0];
            if (groupRecord) {
              config = groupRecord.config;
              org_id = groupRecord.orgId;
              // For now, let's assume the config has a 'topology' field or similar
              // If not, we'll need to decide how to map groups to types.
              // For legacy compatibility, maybe we check the config for clues.
              type =
                (config as any)?.type || (config as any)?.topology || "single";
            } else {
              return json(
                { ok: false, error: "configuration not found in database" },
                404,
              );
            }
          } catch (err) {
            console.error("Failed to fetch config from DB:", err);
            return json(
              { ok: false, error: "database connection failed during init" },
              500,
            );
          }
        } else if (!config || !type) {
          return json(
            {
              ok: false,
              error: "missing type/config and no DATABASE_URL provided",
            },
            400,
          );
        }
      }

      await this.ctx.storage.put("config_id", body.config_id);
      await this.ctx.storage.put("type", type);
      if (org_id) await this.ctx.storage.put("org_id", org_id);
      if (config) await this.ctx.storage.put("config", config);

      // Enforce schema upon initialization
      if (type === "single") {
        const handler = new SingleAgentHandler(this.ctx, this.env);
        await handler.ensureSchema();
      } else if (type === "multi") {
        const handler = new MultiAgentHandler(this.ctx, this.env);
        await handler.ensureSchema();
      } else if (type === "workflow") {
        const handler = new WorkflowHandler(this.ctx, this.env);
        await handler.ensureSchema();
      }

      return json({ ok: true, config_id: body.config_id, type: type });
    }

    // Determine type for routing
    const type = await this.ctx.storage.get("type");
    if (!type) {
      return json(
        { ok: false, error: "memory controller not initialized" },
        409,
      );
    }

    // Delegate to specific handlers
    if (type === "single") {
      const handler = new SingleAgentHandler(this.ctx, this.env);
      return handler.handle(request, route);
    }

    if (type === "multi") {
      const handler = new MultiAgentHandler(this.ctx, this.env);
      return handler.handle(request, route);
    }

    if (type === "workflow") {
      const handler = new WorkflowHandler(this.ctx, this.env);
      return handler.handle(request, route);
    }

    return new Response("Not Found", { status: 404 });
  }
}

function parseConfigId(pathname: string, prefix: string) {
  const parts = pathname.split("/");
  const idx = parts.indexOf(prefix.replace(/\//g, ""));
  if (idx !== -1 && parts.length > idx + 1) {
    return parts[idx + 1];
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "memory-controller",
        env: env.ENVIRONMENT,
      });
    }

    // Dev Routes (Only available in development)
    if (env.ENVIRONMENT === "dev" && url.pathname.startsWith("/dev/")) {
      const configId = parseConfigId(url.pathname, "dev");
      if (!configId)
        return new Response("Missing configId in /dev route", { status: 400 });

      const id = env.MEMORY_CONTROLLER.idFromName(configId);
      const stub = env.MEMORY_CONTROLLER.get(id);

      // We pass the request along, relying on pathSuffix in the DO to strip `/dev/configId`
      return stub.fetch(request);
    }

    // Production/Orchestrator Routes
    if (!hasOrchestratorToken(request, env)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    if (url.pathname.startsWith("/chats/")) {
      const chatId = parseConfigId(url.pathname, "chats");
      if (!chatId) return new Response("Not Found", { status: 404 });

      const id = env.MEMORY_CONTROLLER.idFromName(chatId);
      const stub = env.MEMORY_CONTROLLER.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
