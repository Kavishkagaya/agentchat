import { createAgentAccessToken } from "@axon/shared";

interface Env {
  AGENTS_BASE_URL?: string;
  CHAT_CONTROLLER: DurableObjectNamespace;
  ENVIRONMENT: string;
  GC_PRIVATE_KEY: string;
  ORCHESTRATOR_SERVICE_TOKEN?: string;
}

type HistoryMode = "internal" | "external";

type InitRequest = {
  group_id: string;
  history_mode?: HistoryMode;
  org_id: string;
};

type PostMessageRequest = {
  agent_ids?: string[];
  message_id?: string;
  text?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) {
    throw new Error("missing JSON body");
  }
  return JSON.parse(text) as T;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing ${field}`);
  }
  return value;
}

function pathSuffix(pathname: string): string {
  const chatsPrefix = /^\/chats\/[^/]+/;
  const groupsPrefix = /^\/groups\/[^/]+/;
  if (chatsPrefix.test(pathname)) {
    const stripped = pathname.replace(chatsPrefix, "");
    return stripped.length > 0 ? stripped : "/";
  }
  if (groupsPrefix.test(pathname)) {
    const stripped = pathname.replace(groupsPrefix, "");
    return stripped.length > 0 ? stripped : "/";
  }
  return pathname;
}

function hasOrchestratorToken(request: Request, env: Env) {
  if (!env.ORCHESTRATOR_SERVICE_TOKEN) {
    return true;
  }
  return (
    request.headers.get("x-orchestrator-service-token") ===
    env.ORCHESTRATOR_SERVICE_TOKEN
  );
}

export class ChatController {
  constructor(private state: DurableObjectState) {}

  private async ensureSchema() {
    const sql = this.state.storage.sql;
    if (!sql) {
      throw new Error("SQLite storage is not available");
    }
    sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (message_id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)"
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS context_compaction (id INTEGER PRIMARY KEY CHECK(id=1), summary TEXT NOT NULL, updated_at TEXT NOT NULL)"
    );
  }

  private async upsertCompactionSummary(summary: string) {
    const sql = this.state.storage.sql;
    const now = new Date().toISOString();
    sql.exec(
      "INSERT INTO context_compaction (id, summary, updated_at) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET summary = ?1, updated_at = ?2",
      summary,
      now
    );
  }

  private async maybeCompactContext() {
    const sql = this.state.storage.sql;
    const rows = Array.from(
      sql.exec("SELECT COUNT(*) AS count FROM messages")
    ) as Array<{ count?: number }>;
    const count = Number(rows[0]?.count ?? 0);
    if (count < 100) {
      return;
    }
    const latest = Array.from(
      sql.exec("SELECT text FROM messages ORDER BY created_at DESC LIMIT 20")
    ) as Array<{ text: string }>;
    const summary = latest.map((row) => row.text).reverse().join("\n");
    await this.upsertCompactionSummary(summary);
  }

  private async insertMessage(
    messageId: string,
    role: "assistant" | "system" | "user",
    text: string
  ) {
    const sql = this.state.storage.sql;
    const createdAt = new Date().toISOString();
    sql.exec(
      "INSERT INTO messages (message_id, role, text, created_at) VALUES (?1, ?2, ?3, ?4)",
      messageId,
      role,
      text,
      createdAt
    );
    return { message_id: messageId, role, text, created_at: createdAt };
  }

  private listMessages() {
    const sql = this.state.storage.sql;
    const rows = Array.from(
      sql.exec(
        "SELECT message_id, role, text, created_at FROM messages ORDER BY created_at ASC"
      )
    ) as Array<{
      created_at: string;
      message_id: string;
      role: string;
      text: string;
    }>;
    return rows;
  }

  private async runAgent(
    env: Env,
    groupId: string,
    orgId: string,
    agentId: string,
    prompt: string
  ): Promise<{ message_id: string; role: string; text: string } | null> {
    const baseUrl = env.AGENTS_BASE_URL;
    if (!baseUrl) {
      return null;
    }

    const token = await createAgentAccessToken(env.GC_PRIVATE_KEY, {
      agent_id: agentId,
      group_id: groupId,
      org_id: orgId,
    });

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/agents/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-group-id": groupId,
      },
      body: JSON.stringify({
        agent_id: agentId,
        prompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { text?: string };
    const messageId = `msg_${crypto.randomUUID()}`;
    const text = typeof payload.text === "string" ? payload.text : "";
    await this.insertMessage(messageId, "assistant", text);
    return { message_id: messageId, role: "assistant", text };
  }

  async fetch(request: Request, env: Env): Promise<Response> {
    await this.ensureSchema();
    if (!hasOrchestratorToken(request, env)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const route = pathSuffix(url.pathname);

    if (request.method === "POST" && route === "/init") {
      const body = (await request.json()) as InitRequest;
      const groupId = requireString(body.group_id, "group_id");
      const orgId = requireString(body.org_id, "org_id");
      const historyMode: HistoryMode =
        body.history_mode === "external" ? "external" : "internal";

      await this.state.storage.put("group_id", groupId);
      await this.state.storage.put("org_id", orgId);
      await this.state.storage.put("history_mode", historyMode);
      return json({ ok: true, group_id: groupId, history_mode: historyMode });
    }

    if (request.method === "GET" && (route === "/messages" || route === "/history")) {
      const historyMode =
        ((await this.state.storage.get("history_mode")) as HistoryMode | undefined) ??
        "internal";
      if (historyMode === "external") {
        return json({
          messages: [],
          history_mode: historyMode,
          delegated: true,
        });
      }
      const messages = this.listMessages();
      return json({ messages, history_mode: historyMode, delegated: false });
    }

    if (request.method === "POST" && route === "/messages") {
      let body: PostMessageRequest;
      try {
        body = await readJson<PostMessageRequest>(request);
      } catch {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }

      try {
        const messageId = requireString(body.message_id, "message_id");
        const text = requireString(body.text, "text");
        const groupId = (await this.state.storage.get("group_id")) as
          | string
          | undefined;
        const orgId = (await this.state.storage.get("org_id")) as
          | string
          | undefined;
        if (!groupId || !orgId) {
          return json(
            {
              ok: false,
              error: "group controller not initialized",
            },
            409
          );
        }

        const historyMode =
          ((await this.state.storage.get("history_mode")) as
            | HistoryMode
            | undefined) ?? "internal";
        if (historyMode === "internal") {
          await this.insertMessage(messageId, "user", text);
          await this.maybeCompactContext();
        }

        const agentIds = Array.isArray(body.agent_ids) ? body.agent_ids : [];
        const agentMessages: Array<{
          message_id: string;
          role: string;
          text: string;
        }> = [];
        for (const agentId of agentIds) {
          if (typeof agentId !== "string" || agentId.length === 0) {
            continue;
          }
          const result = await this.runAgent(env, groupId, orgId, agentId, text);
          if (result) {
            agentMessages.push(result);
          }
        }

        return json({
          ok: true,
          message_id: messageId,
          agent_messages: agentMessages,
          history_mode: historyMode,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "invalid request",
          },
          400
        );
      }
    }

    if (request.method === "POST" && route === "/archive") {
      const historyMode =
        ((await this.state.storage.get("history_mode")) as HistoryMode | undefined) ??
        "internal";
      const groupId =
        ((await this.state.storage.get("group_id")) as string | undefined) ?? "unknown";
      const messages =
        historyMode === "internal"
          ? this.listMessages()
          : ([] as Array<{
              created_at: string;
              message_id: string;
              role: string;
              text: string;
            }>);
      const compactionRows = Array.from(
        this.state.storage.sql.exec(
          "SELECT summary, updated_at FROM context_compaction WHERE id = 1 LIMIT 1"
        )
      ) as Array<{ summary?: string; updated_at?: string }>;
      const compaction =
        compactionRows.length > 0
          ? {
              summary: compactionRows[0].summary ?? "",
              updated_at: compactionRows[0].updated_at ?? new Date().toISOString(),
            }
          : null;
      const snapshot = {
        group_id: groupId,
        history_mode: historyMode,
        archived_at: new Date().toISOString(),
        compaction,
        messages,
      };
      this.state.storage.sql.exec("DELETE FROM messages");
      this.state.storage.sql.exec("DELETE FROM context_compaction");
      return json({ ok: true, snapshot });
    }

    if (route === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      server.send(JSON.stringify({ type: "status", status: "connected" }));
      server.addEventListener("message", (event) => {
        server.send(
          JSON.stringify({ type: "echo", payload: event.data?.toString() ?? "" })
        );
      });
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}

function parseChatId(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== "chats") {
    return null;
  }
  return segments[1];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "chat-controller",
        env: env.ENVIRONMENT,
      });
    }

    if (!hasOrchestratorToken(request, env)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const chatId = parseChatId(url.pathname);
    if (!chatId) {
      return new Response("Not Found", { status: 404 });
    }

    const id = env.CHAT_CONTROLLER.idFromName(chatId);
    const stub = env.CHAT_CONTROLLER.get(id);
    const subPath = url.pathname.replace(`/chats/${chatId}`, "");
    const targetUrl = new URL(request.url);
    targetUrl.pathname = subPath || "/";

    const forward = new Request(targetUrl.toString(), request);
    return stub.fetch(forward);
  },
};
