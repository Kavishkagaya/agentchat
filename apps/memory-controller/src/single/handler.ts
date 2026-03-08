import { createAgentAccessToken } from "@axon/shared";
import type { Env } from "../index";

export class SingleAgentHandler {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  async ensureSchema() {
    const sql = this.ctx.storage.sql;
    if (!sql) throw new Error("SQLite storage is not available");
    sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (message_id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)"
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS context_compaction (id INTEGER PRIMARY KEY CHECK(id=1), summary TEXT NOT NULL, updated_at TEXT NOT NULL)"
    );
  }

  private async upsertCompactionSummary(summary: string) {
    const sql = this.ctx.storage.sql;
    const now = new Date().toISOString();
    sql.exec(
      "INSERT INTO context_compaction (id, summary, updated_at) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET summary = ?1, updated_at = ?2",
      summary,
      now
    );
  }

  private async maybeCompactContext() {
    const sql = this.ctx.storage.sql;
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
    const sql = this.ctx.storage.sql;
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
    const sql = this.ctx.storage.sql;
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
    configId: string,
    orgId: string,
    agentId: string,
    prompt: string
  ): Promise<{ message_id: string; role: string; text: string } | null> {
    const baseUrl = this.env.AGENTS_BASE_URL;
    if (!baseUrl) {
      console.warn("No AGENTS_BASE_URL provided");
      return null;
    }

    // In dev mode without a real private key, we might need a fallback,
    // but the shared library requires valid signatures unless we mock it.
    // For now we assume env.GC_PRIVATE_KEY is set or we mock it in tests.
    let token = "";
    try {
      token = await createAgentAccessToken(this.env.GC_PRIVATE_KEY, {
        agent_id: agentId,
        config_id: configId, // Temporarily mapped to config_id for token compat
        org_id: orgId,
      });
    } catch (e) {
       console.warn("Failed to create agent token, sending without auth (dev only):", e);
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-config-id": configId,
    };
    if (token) headers.authorization = `Bearer ${token}`;

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/agents/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agent_id: agentId,
        prompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Agent run failed:", response.status, await response.text());
      return null;
    }

    const payload = (await response.json()) as { text?: string };
    const messageId = `msg_${crypto.randomUUID()}`;
    const text = typeof payload.text === "string" ? payload.text : "";
    await this.insertMessage(messageId, "assistant", text);
    return { message_id: messageId, role: "assistant", text };
  }

  async handle(request: Request, route: string): Promise<Response> {
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (request.method === "GET" && (route === "/messages" || route === "/history")) {
      const messages = this.listMessages();
      return json({ messages, type: "single" });
    }

    if (request.method === "POST" && route === "/messages") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }

      const messageId = body.message_id || `msg_${crypto.randomUUID()}`;
      const text = body.text;
      if (!text) return json({ ok: false, error: "missing text" }, 400);

      const configId = (await this.ctx.storage.get("config_id")) as string;
      const orgId = (await this.ctx.storage.get("org_id")) as string || "dev_org";

      await this.insertMessage(messageId, "user", text);
      await this.maybeCompactContext();

      const agentIds = Array.isArray(body.agent_ids) ? body.agent_ids : [];
      const agentMessages: any[] = [];
      
      for (const agentId of agentIds) {
        if (typeof agentId !== "string" || agentId.length === 0) continue;
        const result = await this.runAgent(configId, orgId, agentId, text);
        if (result) agentMessages.push(result);
      }

      return json({
        ok: true,
        message_id: messageId,
        agent_messages: agentMessages,
      });
    }

    return new Response("Not Found in SingleAgentHandler", { status: 404 });
  }
}
