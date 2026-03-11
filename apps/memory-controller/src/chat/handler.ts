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

    sql.exec(`
      CREATE TABLE IF NOT EXISTS message_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id  TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        data        TEXT NOT NULL,
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

  private insertEvent(messageId: string, eventType: string, data: unknown) {
    this.ctx.storage.sql.exec(
      "INSERT INTO message_events (message_id, event_type, data, created_at) VALUES (?1,?2,?3,?4)",
      messageId,
      eventType,
      JSON.stringify(data),
      new Date().toISOString()
    );
  }

  public listMessages(params?: { cursor?: string; limit?: number }) {
    const limit = Math.min(params?.limit ?? 50, 200);
    const cursor = params?.cursor ?? new Date().toISOString();

    const rows = Array.from(
      this.ctx.storage.sql.exec(
        "SELECT message_id, role, text, agent_id, sender_id, sender_name, tokens, created_at FROM messages WHERE created_at < ?1 ORDER BY created_at DESC LIMIT ?2",
        cursor,
        limit
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

    const has_more = rows.length === limit;
    const next_cursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return {
      messages: rows.reverse(),
      next_cursor,
      has_more,
    };
  }

  public getMessageEvents(messageId: string) {
    return Array.from(
      this.ctx.storage.sql.exec(
        "SELECT event_type, data, created_at FROM message_events WHERE message_id = ?1 ORDER BY id ASC",
        messageId
      )
    ) as Array<{ event_type: string; data: string; created_at: string }>;
  }

  // SSE line parser — shared by both methods
  private async *consumeSSE(response: Response): AsyncGenerator<{ event: string; data: any }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            yield { event: currentEvent, data };
          } catch {
            // malformed JSON, skip
          }
          currentEvent = "message";
        }
        // empty lines and comments ignored
      }
    }
  }

  // Build fetch options for agent calls (shared)
  private async buildAgentFetchOptions(
    agentId: string,
    prompt: string,
    context: Array<{ role: string; content: string }>,
    configId: string,
    orgId: string
  ) {
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

    return {
      headers,
      body: JSON.stringify({
        agent_id: agentId,
        config_id: configId,
        prompt,
        messages: context,
      }),
    };
  }

  // Coarse stream: /agents/run — events in real-time, but text only in final
  public async *invokeAgentCoarse(
    agentId: string,
    prompt: string,
    context: Array<{ role: string; content: string }>,
    configId: string,
    orgId: string
  ): AsyncGenerator<{ event: string; data: any }> {
    const baseUrl = this.env.AGENTS_BASE_URL;
    if (!baseUrl) return;

    const opts = await this.buildAgentFetchOptions(agentId, prompt, context, configId, orgId);

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agents/run`, {
      method: "POST",
      ...opts,
    });

    if (!res.ok) {
      console.error(`Agent ${agentId} run failed: ${res.status}`);
      return;
    }

    yield* this.consumeSSE(res);
  }

  // Fine stream: /agents/run-stream — token-by-token text_delta events
  public async *invokeAgentStream(
    agentId: string,
    prompt: string,
    context: Array<{ role: string; content: string }>,
    configId: string,
    orgId: string
  ): AsyncGenerator<{ event: string; data: any }> {
    const baseUrl = this.env.AGENTS_BASE_URL;
    if (!baseUrl) return;

    const opts = await this.buildAgentFetchOptions(agentId, prompt, context, configId, orgId);

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agents/run-stream`, {
      method: "POST",
      ...opts,
    });

    if (!res.ok) {
      console.error(`Agent ${agentId} stream failed: ${res.status}`);
      return;
    }

    yield* this.consumeSSE(res);
  }

  public async processAgentEvents(
    agentId: string,
    eventStream: AsyncGenerator<{ event: string; data: any }>,
    options: {
      broadcast: boolean; // true for WS, true for HTTP (pushes to WS clients)
      streamDeltas: boolean; // true when using run-stream (forward text_delta to WS)
    }
  ): Promise<{
    text: string;
    agent_nickname: string;
    usage?: unknown;
    agent_id: string;
    message_id: string;
  } | null> {
    const agentMsgId = `msg_${crypto.randomUUID()}`;
    let finalResult: { text: string; agent_nickname: string; usage?: unknown } | null = null;

    // Broadcast that this agent started (so UI can show typing indicator)
    if (options.broadcast) {
      this.broadcast({
        type: "agent_start",
        agent_id: agentId,
        message_id: agentMsgId,
      });
    }

    for await (const { event, data } of eventStream) {
      switch (event) {
        case "text_delta":
          // Stream to WS clients only — NOT stored (final text has the complete version)
          if (options.streamDeltas && options.broadcast) {
            this.broadcast({
              type: "text_delta",
              agent_id: agentId,
              message_id: agentMsgId,
              text: data.text,
            });
          }
          break;

        case "event":
          // tool_call, tool_result, tool_error — broadcast AND store
          if (options.broadcast) {
            this.broadcast({
              type: data.eventType,
              agent_id: agentId,
              message_id: agentMsgId,
              ...data,
            });
          }
          this.insertEvent(agentMsgId, data.eventType, data);
          break;

        case "reasoning":
          // Stream to WS clients only — NOT stored
          if (options.broadcast) {
            this.broadcast({
              type: "reasoning",
              agent_id: agentId,
              message_id: agentMsgId,
              text: data.text,
            });
          }
          break;

        case "step_finish":
          // NOT stored — usage stats already in final event
          break;

        case "status":
          // Ephemeral — broadcast but don't store
          if (options.broadcast) {
            this.broadcast({
              type: "agent_status",
              agent_id: agentId,
              message_id: agentMsgId,
              status: data.status,
            });
          }
          break;

        case "final":
          finalResult = {
            text: data.text,
            agent_nickname: data.agent_nickname ?? agentId,
            usage: data.usage,
          };
          break;

        case "error":
          if (options.broadcast) {
            this.broadcast({
              type: "agent_error",
              agent_id: agentId,
              message_id: agentMsgId,
              error: data,
            });
          }
          this.insertEvent(agentMsgId, "error", data);
          break;
      }
    }

    if (!finalResult?.text) {
      console.error(`Agent ${agentId}: no final text in stream`);
      return null;
    }

    // Store the final message (full text)
    const agentName = finalResult.agent_nickname || agentId;
    const text = `[${agentName}]: ${finalResult.text}`;

    this.insertMessage({
      messageId: agentMsgId,
      role: "assistant",
      text,
      agentId,
      tokens: (finalResult.usage as any)?.outputTokens,
    });

    // Broadcast the complete message
    if (options.broadcast) {
      this.broadcast({
        type: "agent_message",
        message_id: agentMsgId,
        agent_id: agentId,
        agent_name: agentName,
        text: finalResult.text,
      });
    }

    return { ...finalResult, agent_id: agentId, message_id: agentMsgId };
  }

  public async handleWebSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    // 1. Parse incoming JSON
    let msg: {
      type: string;
      text?: string;
      agent_ids?: string[];
      sender_id?: string;
      sender_name?: string;
      message_id?: string;
    };
    try {
      msg = JSON.parse(
        typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage)
      );
    } catch {
      ws.send(JSON.stringify({ type: "error", code: "parse_error", message: "invalid JSON" }));
      return;
    }

    if (msg.type !== "message" || !msg.text) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "invalid_message",
          message: "missing text or wrong type",
        })
      );
      return;
    }

    // 2. Load config
    const configId = (await this.ctx.storage.get("config_id")) as string;
    const orgId = ((await this.ctx.storage.get("org_id")) as string) ?? "dev_org";
    const config = (await this.ctx.storage.get("config")) as Record<string, unknown> | undefined;

    // 3. Store & broadcast user message
    const messageId = msg.message_id ?? `msg_${crypto.randomUUID()}`;
    const userText = msg.sender_name ? `[${msg.sender_name}]: ${msg.text}` : msg.text;
    this.insertMessage({
      messageId,
      role: "user",
      text: userText,
      senderId: msg.sender_id,
      senderName: msg.sender_name,
    });

    this.broadcast({
      type: "user_message_stored",
      message_id: messageId,
      sender_id: msg.sender_id,
      sender_name: msg.sender_name,
      text: msg.text,
    });

    // 4. Determine agents
    let agentIds: string[] = [];
    if (Array.isArray(msg.agent_ids)) {
      agentIds = msg.agent_ids.filter(Boolean);
    } else if (config?.auto === true && config?.default_agent) {
      agentIds = [config.default_agent as string];
    }

    // 5. Snapshot context ONCE
    const systemPrompt = config?.system_prompt as string | undefined;
    const context = ContextManager.assembleContext(this.ctx.storage.sql, systemPrompt);

    // 6. Invoke agents with FINE-GRAINED stream (token-by-token via WS)
    for (const agentId of agentIds) {
      const eventStream = this.invokeAgentStream(agentId, msg.text, context, configId, orgId);
      await this.processAgentEvents(agentId, eventStream, {
        broadcast: true, // push everything to WS clients
        streamDeltas: true, // FINE — text_delta per token
      });
    }

    // 7. Signal completion
    this.broadcast({ type: "done" });

    // 8. Compact if needed
    ContextManager.maybeCompact(
      this.ctx.storage.sql,
      config?.compaction_threshold as number | undefined
    );
  }

  private broadcast(event: object): void {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        /* socket may have closed — ignore, webSocketClose handles cleanup */
      }
    }
  }


  async handle(request: Request, route: string): Promise<Response> {
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (request.method === "GET" && (route === "/messages" || route === "/history")) {
      const url = new URL(request.url);
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const limit = url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!, 10)
        : undefined;
      return json({ ...this.listMessages({ cursor, limit }), type: "chat" });
    }

    if (request.method === "GET" && route.match(/^\/messages\/[^/]+\/events$/)) {
      const messageId = route.split("/")[2];
      return json({ events: this.getMessageEvents(messageId) });
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

      // Broadcast user message to WS clients
      this.broadcast({
        type: "user_message_stored",
        message_id: messageId,
        sender_id: senderId,
        sender_name: senderName,
        text: body.text,
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

      // Invoke agents sequentially using COARSE stream (no text_delta)
      const agentMessages: unknown[] = [];
      for (const agentId of agentIds) {
        const eventStream = this.invokeAgentCoarse(
          agentId,
          body.text || "",
          context,
          configId,
          orgId
        );
        const result = await this.processAgentEvents(agentId, eventStream, {
          broadcast: true, // push events to WS clients
          streamDeltas: false, // coarse — no text_delta
        });
        if (result) agentMessages.push(result);
      }

      // Signal completion to WS clients
      this.broadcast({ type: "done" });

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
