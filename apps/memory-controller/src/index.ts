import { normalizeChatRoutingConfig, verify } from "@axon/shared";
import { getDb, initDb, schema } from "@axon/worker-database";
import { eq } from "drizzle-orm";
import { ChatHandler } from "./chat/handler";
import { WorkflowHandler } from "./workflow/handler";

export interface Env {
  AGENTS_BASE_URL?: string;
  CHAT_MENTION_ROUTING_ENABLED?: string;
  MEMORY_CONTROLLER: DurableObjectNamespace;
  ENVIRONMENT: string;
  GC_PRIVATE_KEY: string;
  ORCHESTRATOR_PUBLIC_KEY: string;
  DATABASE_URL?: string;
}

type InitRequest = {
  config_id: string;
  type: "chat" | "workflow";
  org_id?: string;
  config?: Record<string, unknown>;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function verifyOrchestratorToken(
  request: Request,
  env: Env,
): Promise<boolean> {
  if (
    env.ENVIRONMENT === "dev" &&
    new URL(request.url).pathname.startsWith("/dev")
  ) {
    return true;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7);
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  try {
    const isValid = await verify(
      env.ORCHESTRATOR_PUBLIC_KEY,
      encodedPayload,
      signature,
    );
    if (!isValid) return false;

    const payload = JSON.parse(atob(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return false;
    if (payload.sub !== "orchestrator") return false;

    return true;
  } catch {
    return false;
  }
}

function pathSuffix(pathname: string): string {
  const chatsPrefix = /^\/chats\/[^/]+/;
  const devPrefix = /^\/dev\/[^/]+/;
  let stripped = pathname;
  if (chatsPrefix.test(pathname)) {
    stripped = pathname.replace(chatsPrefix, "");
  } else if (devPrefix.test(pathname)) {
    stripped = pathname.replace(devPrefix, "");
  }
  // Normalize: remove trailing slash and ensure it starts with /
  stripped = stripped.replace(/\/$/, "");
  return stripped.length > 0 ? stripped : "/";
}

import { DurableObject } from "cloudflare:workers";

export class MemoryController extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (!(await verifyOrchestratorToken(request, this.env))) {
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

    if (request.method === "POST" && route === "/destroy") {
      try {
        await this.ctx.storage.deleteAll();
        return json({ ok: true });
      } catch (err) {
        return json(
          {
            ok: false,
            error: err instanceof Error ? err.message : "destroy failed",
          },
          500,
        );
      }
    }

    if (request.method === "POST" && route === "/restore") {
      try {
        const sql = this.ctx.storage.sql;
        if (!sql) throw new Error("SQLite storage not available");

        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid JSON body" }, 400);
        }

        const snapshot = body?.snapshot;
        if (
          !snapshot ||
          typeof snapshot.tables !== "object" ||
          Array.isArray(snapshot.tables)
        ) {
          return json(
            { ok: false, error: "missing or invalid snapshot.tables" },
            400,
          );
        }

        let totalRows = 0;
        const restoredTables: string[] = [];

        for (const [tableName, rows] of Object.entries(
          snapshot.tables as Record<string, unknown[]>,
        )) {
          try {
            const rowsArr = rows as Record<string, unknown>[];
            if (!rowsArr.length) continue; // nothing to restore for empty table

            const cols = Object.keys(rowsArr[0]);
            const colDefs = cols.join(", ");
            const placeholders = cols.map(() => "?").join(", ");

            sql.exec(`DROP TABLE IF EXISTS ${tableName}`);
            sql.exec(`CREATE TABLE ${tableName} (${colDefs})`);

            const insertSql = `INSERT INTO ${tableName} (${colDefs}) VALUES (${placeholders})`;
            for (const row of rowsArr) {
              sql.exec(insertSql, ...cols.map((c) => row[c]));
              totalRows++;
            }
            restoredTables.push(tableName);
          } catch (tableErr) {
            console.error(`Failed to restore table ${tableName}:`, tableErr);
          }
        }

        return json({
          ok: true,
          restored: { tables: restoredTables, rows_inserted: totalRows },
        });
      } catch (err) {
        return json(
          {
            ok: false,
            error: err instanceof Error ? err.message : "restore failed",
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

      let config: Record<string, unknown> | undefined = body.config;
      let type = body.type;
      let org_id = body.org_id;
      let configSource: "database" | "request" = config
        ? "request"
        : "database";

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
                (config?.type as "chat" | "workflow" | undefined) ||
                (config?.topology as "chat" | "workflow" | undefined) ||
                "chat";
              configSource = "database";
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

      if (type === "chat") {
        config = normalizeChatRoutingConfig(config);
      }

      await this.ctx.storage.put("config_id", body.config_id);
      await this.ctx.storage.put("type", type);
      if (org_id) await this.ctx.storage.put("org_id", org_id);
      if (config) await this.ctx.storage.put("config", config);

      // Enforce schema upon initialization
      if (type === "chat") {
        const handler = new ChatHandler(this.ctx, this.env);
        await handler.ensureSchema();
      } else if (type === "workflow") {
        const handler = new WorkflowHandler(this.ctx, this.env);
        await handler.ensureSchema();
      }

      return json({
        ok: true,
        config_id: body.config_id,
        type: type,
        config_source: configSource,
      });
    }

    // Determine type for routing
    const type = await this.ctx.storage.get("type");

    // ── WebSocket upgrade ──────────────────────────────
    if (route === "/ws" && request.headers.get("Upgrade") === "websocket") {
      if (type !== "chat") {
        return json(
          { ok: false, error: "only chat type supports websocket" },
          400,
        );
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      this.ctx.acceptWebSocket(server);
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair("ping", "pong"),
      );

      server.send(JSON.stringify({ type: "ready" }));

      return new Response(null, { status: 101, webSocket: client });
    }

    if (!type) {
      return json(
        { ok: false, error: "memory controller not initialized", type: type },
        409,
      );
    }

    try {
      // Delegate to specific handlers
      if (type === "chat") {
        const handler = new ChatHandler(this.ctx, this.env);
        return await handler.handle(request, route);
      }

      if (type === "workflow") {
        const handler = new WorkflowHandler(this.ctx, this.env);
        return await handler.handle(request, route);
      }
    } catch (err) {
      console.error("Handler error:", err);
      return json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "internal handler error",
        },
        500,
      );
    }

    return new Response("Not Found", { status: 404 });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const type = await this.ctx.storage.get("type");
    if (type !== "chat") return;

    const handler = new ChatHandler(this.ctx, this.env);
    await handler.handleWebSocketMessage(ws, message);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    ws.close(code, reason);
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
    if (!(await verifyOrchestratorToken(request, env))) {
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
