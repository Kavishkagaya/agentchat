interface Env {
  CHAT_CONTROLLER: DurableObjectNamespace;
  ENVIRONMENT: string;
}

type AgentRuntimeRef = {
  agent_id: string;
  runtime_id: string;
  base_url: string;
};

type PostMessageRequest = {
  chat_id?: string;
  message_id?: string;
  text?: string;
  agent_runtimes?: AgentRuntimeRef[];
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
  }

  private async insertMessage(messageId: string, role: string, text: string) {
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
    const rows: Array<{
      message_id: string;
      role: string;
      text: string;
      created_at: string;
    }> = [];
    const result = sql.exec(
      "SELECT message_id, role, text, created_at FROM messages ORDER BY created_at ASC"
    );
    for (const row of result) {
      rows.push(
        row as {
          message_id: string;
          role: string;
          text: string;
          created_at: string;
        }
      );
    }
    return rows;
  }

  private async runAgents(
    messageText: string,
    agentRuntimes: AgentRuntimeRef[]
  ) {
    const agentMessages: Array<{
      message_id: string;
      role: string;
      text: string;
    }> = [];
    for (const runtime of agentRuntimes) {
      const response = await fetch(
        `${runtime.base_url.replace(/\/$/, "")}/agents/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            runtime_id: runtime.runtime_id,
            prompt: messageText,
          }),
        }
      );
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as {
        role?: string;
        text?: string;
      };
      const agentMessageId = `msg_${crypto.randomUUID()}`;
      const role = payload.role ?? "assistant";
      const text = payload.text ?? "";
      await this.insertMessage(agentMessageId, role, text);
      agentMessages.push({ message_id: agentMessageId, role, text });
    }
    return agentMessages;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureSchema();
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      const body = (await request.json()) as {
        session_private_key: string;
        session_certificate: string;
      };
      await this.state.storage.put(
        "session_private_key",
        body.session_private_key
      );
      await this.state.storage.put(
        "session_certificate",
        body.session_certificate
      );
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/messages") {
      const messages = this.listMessages();
      return json({ messages });
    }

    if (request.method === "POST" && url.pathname === "/messages") {
      let body: PostMessageRequest;
      try {
        body = await readJson<PostMessageRequest>(request);
      } catch (error) {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }

      try {
        const messageId = requireString(body.message_id, "message_id");
        const text = requireString(body.text, "text");
        await this.insertMessage(messageId, "user", text);
        const agentRuntimes = body.agent_runtimes ?? [];
        const agentMessages = await this.runAgents(text, agentRuntimes);
        return json({
          ok: true,
          message_id: messageId,
          agent_messages: agentMessages,
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
