import { createAgentAccessToken } from "@axon/shared";
import { ContextManager } from "../context-manager";
import type { Env } from "../index";

export class ChatHandler {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  async ensureSchema() {
    const sql = this.ctx.storage.sql;
    if (!sql) throw new Error("SQLite storage not available");

    sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id  TEXT PRIMARY KEY,
        role        TEXT NOT NULL,
        text        TEXT NOT NULL,
        agent_id    TEXT,
        sender_id   TEXT,
        sender_name TEXT,
        tokens      INTEGER,
        created_at  TEXT NOT NULL
      )
    `);

    sql.exec(`
      CREATE TABLE IF NOT EXISTS context_messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        role        TEXT NOT NULL,
        text        TEXT NOT NULL,
        tokens      INTEGER NOT NULL,
        created_at  TEXT NOT NULL
      )
    `);
  }

  private insertMessage(params: {
    messageId: string;
    role: "user" | "assistant" | "system";
    text: string;
    agentId?: string;
    senderId?: string;
    senderName?: string;
    tokens?: number;
  }) {
    const sql = this.ctx.storage.sql;
    const createdAt = new Date().toISOString();
    const tokens = params.tokens ?? ContextManager.estimateTokens(params.text);

    sql.exec(
      "INSERT INTO messages (message_id, role, text, agent_id, sender_id, sender_name, tokens, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
      params.messageId,
      params.role,
      params.text,
      params.agentId ?? null,
      params.senderId ?? null,
      params.senderName ?? null,
      tokens,
      createdAt
    );

    ContextManager.insertContextMessage(sql, {
      role: params.role,
      text: params.text,
      tokens,
    });

    return { ...params, tokens, created_at: createdAt };
  }

  private listMessages() {
    return Array.from(
      this.ctx.storage.sql.exec(
        "SELECT message_id, role, text, agent_id, sender_id, sender_name, tokens, created_at FROM messages ORDER BY created_at ASC"
      )
    ) as Array<{
      message_id: string;
      role: string;
      text: string;
      agent_id: string | null;
      sender_id: string | null;
      sender_name: string | null;
      tokens: number;
      created_at: string;
    }>;
  }

  private async invokeAgent(
    agentId: string,
    prompt: string,
    context: Array<{ role: string; content: string }>,
    configId: string,
    orgId: string
  ): Promise<{
    text: string;
    agent_nickname: string;
    usage?: { completionTokens: number };
    agent_id: string;
  } | null> {
    const baseUrl = this.env.AGENTS_BASE_URL;
    if (!baseUrl) return null;

    let token = "";
    try {
      token = await createAgentAccessToken(this.env.GC_PRIVATE_KEY, {
        agent_id: agentId,
        config_id: configId,
        org_id: orgId,
      });
    } catch (e) {
      console.warn("Token creation failed:", e);
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agents/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agent_id: agentId,
        config_id: configId,
        prompt,
        messages: context,
      }),
    });

    if (!res.ok) {
      console.error(`Agent ${agentId} run failed: ${res.status}`);
      return null;
    }

    const result = (await res.json()) as {
      text: string;
      agent_nickname: string;
      usage?: { completionTokens: number };
    };
    return { ...result, agent_id: agentId };
  }

  async handle(request: Request, route: string): Promise<Response> {
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (request.method === "GET" && (route === "/messages" || route === "/history")) {
      return json({ messages: this.listMessages(), type: "chat" });
    }

    if (request.method === "POST" && route === "/messages") {
      const body = (await request.json()) as {
        text?: string;
        agent_ids?: string[];
        sender_id?: string;
        sender_name?: string;
        message_id?: string;
      };

      if (!body.text) return json({ ok: false, error: "missing text" }, 400);

      const configId = (await this.ctx.storage.get("config_id")) as string;
      const orgId = ((await this.ctx.storage.get("org_id")) as string) ?? "dev_org";
      const config = (await this.ctx.storage.get("config")) as Record<string, unknown>;

      const messageId = body.message_id ?? `msg_${crypto.randomUUID()}`;
      const senderName: string | undefined = body.sender_name;
      const senderId: string | undefined = body.sender_id;
      const userText = senderName ? `[${senderName}]: ${body.text}` : body.text;

      this.insertMessage({
        messageId,
        role: "user",
        text: userText,
        senderId,
        senderName,
      });

      // Unified agent activation: message specifies agent_ids, or use default_agent if auto is enabled
      let agentIds: string[] = [];
      if (Array.isArray(body.agent_ids)) {
        agentIds = body.agent_ids.filter(Boolean);
      } else if (config?.auto === true) {
        const defaultAgent = config?.default_agent as string | undefined;
        if (defaultAgent) {
          agentIds = [defaultAgent];
        }
      }

      // Snapshot context ONCE before invoking any agent with system prompt
      const systemPrompt = config?.system_prompt as string | undefined;
      const context = ContextManager.assembleContext(this.ctx.storage.sql, systemPrompt);

      // All agents run in parallel with the SAME context snapshot
      const results = await Promise.all(
        agentIds.map((agentId) =>
          this.invokeAgent(agentId, body.text || "", context, configId, orgId)
        )
      );

      // Insert all responses after all agents complete
      const agentMessages: unknown[] = [];
      for (const result of results) {
        if (!result) continue;

        const msgId = `msg_${crypto.randomUUID()}`;
        const agentName = result.agent_nickname || result.agent_id;
        const text = `[${agentName}]: ${result.text || ""}`;

        this.insertMessage({
          messageId: msgId,
          role: "assistant",
          text,
          agentId: result.agent_id,
          tokens: result.usage?.completionTokens,
        });

        agentMessages.push({ ...result, message_id: msgId });
      }

      // Compact once after all inserts
      ContextManager.maybeCompact(
        this.ctx.storage.sql,
        config?.compaction_threshold as number | undefined
      );

      return json({
        ok: true,
        message_id: messageId,
        agent_messages: agentMessages,
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}
