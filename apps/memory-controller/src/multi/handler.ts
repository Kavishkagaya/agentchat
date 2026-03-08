import { createAgentAccessToken } from "@axon/shared";
import type { Env } from "../index";

export class MultiAgentHandler {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  async ensureSchema() {
    const sql = this.ctx.storage.sql;
    if (!sql) throw new Error("SQLite storage is not available");
    
    // Core messages table with agent_id for attribution
    sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        agent_id TEXT,
        sender_id TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT -- JSON string for additional info
      )
    `);

    // Table for tracking sessions/threads if needed
    sql.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        thread_id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT NOT NULL
      )
    `);
  }

  private async insertMessage(params: {
    messageId: string;
    role: string;
    text: string;
    agentId?: string;
    senderId?: string;
    metadata?: any;
  }) {
    const sql = this.ctx.storage.sql;
    const createdAt = new Date().toISOString();
    sql.exec(
      "INSERT INTO messages (message_id, role, text, agent_id, sender_id, created_at, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params.messageId,
      params.role,
      params.text,
      params.agentId || null,
      params.senderId || null,
      createdAt,
      params.metadata ? JSON.stringify(params.metadata) : null
    );
    return { ...params, created_at: createdAt };
  }

  private listMessages() {
    const sql = this.ctx.storage.sql;
    const rows = Array.from(
      sql.exec(
        "SELECT message_id, role, text, agent_id, sender_id, created_at, metadata FROM messages ORDER BY created_at ASC"
      )
    ) as any[];
    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null
    }));
  }

  private async runAgent(
    configId: string,
    orgId: string,
    agentId: string,
    prompt: string,
    history: any[]
  ): Promise<{ message_id: string; role: string; text: string; agent_id: string } | null> {
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
      console.warn("Auth creation failed in multi-agent handler:", e);
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
        messages: history.map(m => ({ role: m.role, content: m.text })),
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { text?: string };
    const messageId = `msg_${crypto.randomUUID()}`;
    const text = typeof payload.text === "string" ? payload.text : "";
    
    await this.insertMessage({
      messageId,
      role: "assistant",
      text,
      agentId,
    });

    return { message_id: messageId, role: "assistant", text, agent_id: agentId };
  }

  async handle(request: Request, route: string): Promise<Response> {
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });

    const configId = (await this.ctx.storage.get("config_id")) as string;
    const orgId = (await this.ctx.storage.get("org_id")) as string || "dev_org";
    const config = (await this.ctx.storage.get("config")) as any;

    if (request.method === "GET" && (route === "/messages" || route === "/history")) {
      const messages = this.listMessages();
      return json({ messages, type: "multi" });
    }

    if (request.method === "POST" && route === "/messages") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }

      const text = body.text;
      if (!text) return json({ ok: false, error: "missing text" }, 400);

      const messageId = body.message_id || `msg_${crypto.randomUUID()}`;
      await this.insertMessage({
        messageId,
        role: "user",
        text,
        senderId: body.sender_id,
      });

      const history = this.listMessages();
      const agentMessages: any[] = [];

      // Logic for Coordinator or Manual/Auto-trigger
      const mode = body.mode || config?.mode || "manual";

      if (mode === "coordinator") {
        const coordinatorAgentId = config?.coordinator_agent_id;
        if (!coordinatorAgentId) return json({ ok: false, error: "missing coordinator_agent_id" }, 400);

        // 1. Call Coordinator to get plan
        const planResult = await this.runAgent(configId, orgId, coordinatorAgentId, `Analyze history and decide next steps. User said: ${text}`, history);
        
        if (planResult) {
          agentMessages.push(planResult);
          // In a real implementation, we would parse the plan and call sub-agents here.
          // For now, we just return the coordinator's response.
        }
      } else {
        // Manual/Auto-trigger
        const agentIds = Array.isArray(body.agent_ids) ? body.agent_ids : (config?.auto_trigger_agents || []);
        for (const agentId of agentIds) {
          const res = await this.runAgent(configId, orgId, agentId, text, history);
          if (res) agentMessages.push(res);
        }
      }

      return json({
        ok: true,
        message_id: messageId,
        agent_messages: agentMessages,
      });
    }

    return new Response("Not Found in MultiAgentHandler", { status: 404 });
  }
}
