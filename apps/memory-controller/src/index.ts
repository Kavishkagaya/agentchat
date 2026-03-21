import { normalizeChatRoutingConfig, verify } from "@axon/shared";
import { getDb, initDb, schema } from "@axon/worker-database";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { ChatHandler } from "./chat/handler";
import { ALLOWED_TABLES, type AllowedTable } from "./schema";
import { WorkflowHandler } from "./workflow/handler";

export interface Env {
  AGENTS_BASE_URL?: string;
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
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }
  const [encodedPayload, signature] = parts;

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
  private async initFromDb(configId: string): Promise<{
    config: Record<string, unknown>;
    type: "chat" | "workflow";
    org_id?: string;
  } | null> {
    if (!this.env.DATABASE_URL) return null;

    try {
      initDb(this.env.DATABASE_URL);
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.chats)
        .where(eq(schema.chats.id, configId))
        .limit(1);
      const groupRecord = rows[0];
      if (!groupRecord) return null;

      const config = groupRecord.config as Record<string, unknown> | undefined;
      const type =
        (config?.type as "chat" | "workflow" | undefined) ||
        (config?.topology as "chat" | "workflow" | undefined) ||
        "chat";

      return {
        config: config ?? {},
        type,
        org_id: groupRecord.orgId,
      };
    } catch (err) {
      console.error("Failed to fetch config from DB:", err);
      return null;
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!(await verifyOrchestratorToken(request, this.env))) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const route = pathSuffix(url.pathname);

    if (request.method === "POST" && route === "/archive") {
      try {
        const rawSql = this.ctx.storage.sql;
        if (!rawSql) throw new Error("SQLite storage not available");

        interface ArchiveBody {
          reason?: string;
        }
        let body: ArchiveBody;
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        // Get all table names, then filter against whitelist to prevent SQL injection
        const allTableNames = Array.from(
          rawSql.exec<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          ),
        ).map((row) => row.name);

        const tableNames = allTableNames.filter((n): n is AllowedTable =>
          (ALLOWED_TABLES as readonly string[]).includes(n),
        );

        // Export whitelisted tables using Drizzle's sql tagged template for safe identifier escaping
        const db = drizzle(this.ctx.storage);
        const tables: Record<string, unknown[]> = {};
        for (const tableName of tableNames) {
          const rows = db.all(sql`SELECT * FROM ${sql.identifier(tableName)}`);
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
        const rawSql = this.ctx.storage.sql;
        if (!rawSql) throw new Error("SQLite storage not available");

        interface RestoreBody {
          snapshot?: { tables?: unknown };
        }
        let body: RestoreBody;
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
        const db = drizzle(this.ctx.storage);

        for (const [tableName, rows] of Object.entries(
          snapshot.tables as Record<string, unknown[]>,
        )) {
          // Skip non-whitelisted tables to prevent injection via snapshot
          if (!ALLOWED_TABLES.includes(tableName as AllowedTable)) {
            console.warn(
              `Skipping non-whitelisted table in restore: ${tableName}`,
            );
            continue;
          }

          try {
            const rowsArr = rows as Record<string, unknown>[];
            if (!rowsArr.length) continue; // nothing to restore for empty table

            // Drop using safe identifier escaping
            db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)}`);

            // Recreate via ensureSchema() which has the correct structure
            // (ChatHandler will call this anyway during initialization)
            // For now, just skip the recreate — it will be created on next ensureSchema() call

            // Insert rows using parameterized inserts (safe from injection)
            const colsFromSnapshot = Object.keys(rowsArr[0]);

            for (const row of rowsArr) {
              const values = colsFromSnapshot.map((col) => row[col]);
              const placeholders = colsFromSnapshot
                .map((_, i) => `?${i + 1}`)
                .join(", ");

              rawSql.exec(
                `INSERT INTO ${tableName} (${colsFromSnapshot.join(", ")}) VALUES (${placeholders})`,
                ...values,
              );
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
        const dbInit = await this.initFromDb(body.config_id);
        if (dbInit) {
          config = dbInit.config;
          type = dbInit.type;
          org_id = dbInit.org_id;
          configSource = "database";
        } else if (!config || !type) {
          if (!this.env.DATABASE_URL) {
            return json(
              {
                ok: false,
                error: "missing type/config and no DATABASE_URL provided",
              },
              400,
            );
          } else {
            return json(
              { ok: false, error: "configuration not found in database" },
              404,
            );
          }
        }
      }

      if (type === "chat") {
        config = normalizeChatRoutingConfig(config);
      }

      // Atomic storage init — all-or-nothing
      const initBatch: Record<string, unknown> = {
        config_id: body.config_id,
        type: type,
      };
      if (org_id) initBatch.org_id = org_id;
      if (config) initBatch.config = config;
      await this.ctx.storage.put(initBatch);

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

    if (request.method === "POST" && route === "/update-config") {
      let body: { config: Record<string, unknown> };
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }

      if (!body.config || typeof body.config !== "object") {
        return json({ ok: false, error: "missing config object" }, 400);
      }

      const type = await this.ctx.storage.get("type");
      let config = body.config;

      if (type === "chat") {
        config = normalizeChatRoutingConfig(config);
      }

      await this.ctx.storage.put("config", config);
      return json({ ok: true });
    }

    // Determine type for routing
    const type = await this.ctx.storage.get("type");

    // ── WebSocket upgrade ──────────────────────────────
    if (route === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      this.ctx.acceptWebSocket(server);
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair("ping", "pong"),
      );

      let currentType = type;

      // Auto-init if not yet initialized
      if (!currentType) {
        server.send(JSON.stringify({ type: "initializing" }));
        const configId = parseConfigId(url.pathname, "chats");
        if (configId) {
          const dbInit = await this.initFromDb(configId);
          if (dbInit) {
            let config = dbInit.config;
            if (dbInit.type === "chat") {
              config = normalizeChatRoutingConfig(config);
            }
            // Atomic storage init — all-or-nothing
            const initBatch: Record<string, unknown> = {
              config_id: configId,
              type: dbInit.type,
            };
            if (dbInit.org_id) initBatch.org_id = dbInit.org_id;
            if (config) initBatch.config = config;
            await this.ctx.storage.put(initBatch);

            if (dbInit.type === "chat") {
              const handler = new ChatHandler(this.ctx, this.env);
              await handler.ensureSchema();
            } else if (dbInit.type === "workflow") {
              const handler = new WorkflowHandler(this.ctx, this.env);
              await handler.ensureSchema();
            }
            currentType = dbInit.type;
          } else {
            server.send(
              JSON.stringify({
                type: "error",
                code: "not_initialized",
                message: "Could not initialize chat from database",
              }),
            );
            return new Response(null, { status: 101, webSocket: client });
          }
        } else {
          server.send(
            JSON.stringify({
              type: "error",
              code: "not_initialized",
              message: "Could not extract config ID from URL",
            }),
          );
          return new Response(null, { status: 101, webSocket: client });
        }
      }

      if (currentType !== "chat") {
        server.send(
          JSON.stringify({
            type: "error",
            code: "unsupported_type",
            message: "only chat type supports websocket",
          }),
        );
        return new Response(null, { status: 101, webSocket: client });
      }

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
