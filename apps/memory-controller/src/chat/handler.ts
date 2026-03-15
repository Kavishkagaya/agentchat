import {
  chatMessageRequestSchema,
  createAgentAccessToken,
  type AgentUsage,
  type ChatRoutingConfig,
  type ChatWsEvent,
  type MessageOrigin,
} from "@axon/shared";
import { ContextManager } from "../context-manager";
import { getTriggerDepthLimit, resolveChatTargets } from "./decision-maker";
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
        agent_nickname TEXT,
        tokens      INTEGER,
        created_at  TEXT NOT NULL
      )
    `);

    // Migration: add agent_nickname column for existing tables
    try { sql.exec("ALTER TABLE messages ADD COLUMN agent_nickname TEXT"); } catch { /* column already exists */ }

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
    agentNickname?: string;
    senderId?: string;
    senderName?: string;
    tokens?: number;
  }) {
    const sql = this.ctx.storage.sql;
    const createdAt = new Date().toISOString();
    const tokens = params.tokens ?? ContextManager.estimateTokens(params.text);

    sql.exec(
      "INSERT INTO messages (message_id, role, text, agent_id, agent_nickname, sender_id, sender_name, tokens, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
      params.messageId,
      params.role,
      params.text,
      params.agentId ?? null,
      params.agentNickname ?? null,
      params.senderId ?? null,
      params.senderName ?? null,
      tokens,
      createdAt
    );

    // Context messages include attribution so the LLM knows who said what
    let contextText = params.text;
    if (params.role === "assistant" && params.agentNickname) {
      contextText = `[${params.agentNickname}]: ${params.text}`;
    } else if (params.role === "user" && params.senderName) {
      contextText = `[${params.senderName}]: ${params.text}`;
    }

    ContextManager.insertContextMessage(sql, {
      role: params.role,
      text: contextText,
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
        "SELECT message_id, role, text, agent_id, agent_nickname, sender_id, sender_name, tokens, created_at FROM messages WHERE created_at < ?1 ORDER BY created_at DESC LIMIT ?2",
        cursor,
        limit
      )
    ) as Array<{
      message_id: string;
      role: string;
      text: string;
      agent_id: string | null;
      agent_nickname: string | null;
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
  private async *consumeSSE(response: Response): AsyncGenerator<{ event: string; data: unknown }> {
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
  ): AsyncGenerator<{ event: string; data: unknown }> {
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
  ): AsyncGenerator<{ event: string; data: unknown }> {
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

  private resolveAgentNickname(agentId: string, config: ChatRoutingConfig | undefined): string {
    return config?.agent_setups?.find((s) => s.agentId === agentId)?.nickname ?? agentId;
  }

  /**
   * Parse an SSE { event, data } pair into a typed AgentSseEvent.
   * Returns undefined for unrecognised event names.
   */
  private static parseSseEvent(event: string, data: unknown): import("@axon/shared").AgentSseEvent | undefined {
    // The SSE event name maps 1:1 to AgentSseEvent.type — attach it and return.
    const obj = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    return { type: event, ...obj } as import("@axon/shared").AgentSseEvent;
  }

  public async processAgentEvents(
    agentId: string,
    eventStream: AsyncGenerator<{ event: string; data: unknown }>,
    options: {
      broadcast: boolean;
      streamDeltas: boolean;
      config?: ChatRoutingConfig;
    }
  ): Promise<{
    text: string;
    agent_nickname: string;
    usage: AgentUsage | null;
    agent_id: string;
    message_id: string;
  } | null> {
    const agentMsgId = `msg_${crypto.randomUUID()}`;
    let finalResult: { text: string; agent_nickname: string; usage: AgentUsage | null } | null = null;
    const knownNickname = this.resolveAgentNickname(agentId, options.config);

    // Broadcast that this agent started (so UI can show typing indicator)
    if (options.broadcast) {
      this.broadcast({
        type: "agent_start",
        agent_id: agentId,
        agent_nickname: knownNickname,
        message_id: agentMsgId,
      });
    }

    for await (const { event: rawEvent, data } of eventStream) {
      const evt = ChatHandler.parseSseEvent(rawEvent, data);
      if (!evt) continue;

      switch (evt.type) {
        case "text_delta":
          if (options.streamDeltas && options.broadcast) {
            this.broadcast({
              type: "text_delta",
              agent_id: agentId,
              message_id: agentMsgId,
              text: evt.text,
            });
          }
          break;

        case "tool_call":
          if (options.broadcast) {
            this.broadcast({
              type: "tool_call",
              agent_id: agentId,
              message_id: agentMsgId,
              tool_call_id: evt.tool_call_id,
              name: evt.name,
              args: evt.args,
            });
          }
          this.insertEvent(agentMsgId, "tool_call", evt);
          break;

        case "tool_result":
          if (options.broadcast) {
            this.broadcast({
              type: "tool_result",
              agent_id: agentId,
              message_id: agentMsgId,
              tool_call_id: evt.tool_call_id,
              name: evt.name,
              result: evt.result,
            });
          }
          this.insertEvent(agentMsgId, "tool_result", evt);
          break;

        case "tool_error":
          this.insertEvent(agentMsgId, "tool_error", evt);
          break;

        case "reasoning":
          if (options.broadcast) {
            this.broadcast({
              type: "reasoning",
              agent_id: agentId,
              message_id: agentMsgId,
              text: evt.text,
            });
          }
          break;

        case "step_finish":
          break;

        case "status":
          if (options.broadcast) {
            this.broadcast({
              type: "agent_status",
              agent_id: agentId,
              message_id: agentMsgId,
              status: evt.status,
            });
          }
          break;

        case "final":
          finalResult = {
            text: evt.text,
            agent_nickname: evt.agent_nickname ?? knownNickname,
            usage: evt.usage,
          };
          break;

        case "error":
          if (options.broadcast) {
            this.broadcast({
              type: "agent_error",
              agent_id: agentId,
              message_id: agentMsgId,
              code: evt.code,
              message: evt.message,
            });
          }
          this.insertEvent(agentMsgId, "error", evt);
          break;
      }
    }

    if (!finalResult?.text) {
      console.error(`Agent ${agentId}: no final text in stream`);
      if (options.broadcast) {
        this.broadcast({
          type: "agent_error",
          agent_id: agentId,
          message_id: agentMsgId,
          code: "no_response",
          message: "Agent stream ended without producing a response",
        });
      }
      return null;
    }

    const agentNickname = finalResult.agent_nickname || knownNickname;

    this.insertMessage({
      messageId: agentMsgId,
      role: "assistant",
      text: finalResult.text,
      agentId,
      agentNickname,
      tokens: finalResult.usage?.completionTokens,
    });

    // Broadcast the complete message
    if (options.broadcast) {
      this.broadcast({
        type: "agent_message",
        message_id: agentMsgId,
        agent_id: agentId,
        agent_nickname: agentNickname,
        text: finalResult.text,
      });
    }

    return { ...finalResult, agent_id: agentId, message_id: agentMsgId };
  }

  private isMentionRoutingEnabled(): boolean {
    return this.env.CHAT_MENTION_ROUTING_ENABLED !== "false";
  }

  private emitRoutingWarnings(params: {
    messageId: string;
    unknownMentions: string[];
    source: string;
    origin: MessageOrigin;
  }) {
    if (params.unknownMentions.length === 0) return;

    const payload = {
      unknown_mentions: params.unknownMentions,
      source: params.source,
      origin: params.origin,
    };
    this.insertEvent(params.messageId, "routing_warning", payload);
    this.broadcast({
      type: "routing_warning",
      message_id: params.messageId,
      ...payload,
    });
  }

  private async routeAndRunAgents(params: {
    text: string;
    messageId: string;
    explicitAgentIds?: string[];
    origin: MessageOrigin;
    configId: string;
    orgId: string;
    config: Record<string, unknown> | undefined;
    streamDeltas: boolean;
  }): Promise<{
    agentMessages: Array<{
      text: string;
      agent_nickname: string;
      usage: AgentUsage | null;
      agent_id: string;
      message_id: string;
    }>;
  }> {
    const initialDecision = resolveChatTargets({
      config: params.config,
      text: params.text,
      explicitAgentIds: params.explicitAgentIds,
      origin: params.origin,
      mentionRoutingEnabled: this.isMentionRoutingEnabled(),
    });
    this.insertEvent(params.messageId, "routing_decision", {
      origin: params.origin,
      source: initialDecision.source,
      targets: initialDecision.targetAgentIds,
    });

    this.emitRoutingWarnings({
      messageId: params.messageId,
      unknownMentions: initialDecision.unknownMentions,
      source: initialDecision.source,
      origin: params.origin,
    });

    const maxDepth = getTriggerDepthLimit(initialDecision.config);
    const dedupeTargets = new Set<string>();
    const queue = initialDecision.targetAgentIds.map((agentId) => {
      dedupeTargets.add(agentId);
      return { agentId, prompt: params.text, depth: 0 };
    });

    const agentMessages: Array<{
      text: string;
      agent_nickname: string;
      usage: AgentUsage | null;
      agent_id: string;
      message_id: string;
    }> = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      const agentNickname = this.resolveAgentNickname(current.agentId, initialDecision.config);
      const systemPrompt = initialDecision.config.system_prompt
        ? `${initialDecision.config.system_prompt}\n\nIMPORTANT: Your name is @${agentNickname}. You are currently acting as this agent. Do not mention yourself.`
        : `IMPORTANT: Your name is @${agentNickname}. You are currently acting as this agent. Do not mention yourself.`;

      const context = ContextManager.assembleContext(
        this.ctx.storage.sql,
        systemPrompt
      );

      const eventStream = params.streamDeltas
        ? this.invokeAgentStream(
            current.agentId,
            current.prompt,
            context,
            params.configId,
            params.orgId
          )
        : this.invokeAgentCoarse(
            current.agentId,
            current.prompt,
            context,
            params.configId,
            params.orgId
          );

      const result = await this.processAgentEvents(current.agentId, eventStream, {
        broadcast: true,
        streamDeltas: params.streamDeltas,
        config: initialDecision.config,
      });
      if (!result) continue;

      agentMessages.push(result);

      if (current.depth >= maxDepth) {
        this.insertEvent(result.message_id, "routing_depth_cap", {
          depth: current.depth,
          max_depth: maxDepth,
        });
        continue;
      }

      const chainedDecision = resolveChatTargets({
        config: initialDecision.config,
        text: result.text,
        origin: "agent",
        mentionRoutingEnabled: this.isMentionRoutingEnabled(),
      });
      this.insertEvent(result.message_id, "routing_decision", {
        origin: "agent",
        source: chainedDecision.source,
        targets: chainedDecision.targetAgentIds,
      });

      this.emitRoutingWarnings({
        messageId: result.message_id,
        unknownMentions: chainedDecision.unknownMentions,
        source: chainedDecision.source,
        origin: "agent",
      });

      for (const targetAgentId of chainedDecision.targetAgentIds) {
        if (dedupeTargets.has(targetAgentId)) {
          this.insertEvent(result.message_id, "routing_deduped_target", {
            target_agent_id: targetAgentId,
          });
          continue;
        }
        dedupeTargets.add(targetAgentId);
        queue.push({
          agentId: targetAgentId,
          prompt: result.text,
          depth: current.depth + 1,
        });
      }
    }

    return { agentMessages };
  }

  public async handleWebSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage)
      );
    } catch {
      ws.send(JSON.stringify({ type: "error", code: "parse_error", message: "invalid JSON" }));
      return;
    }

    const parsedMessage = chatMessageRequestSchema.safeParse(parsed);
    if (!parsedMessage.success) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "invalid_message",
          message: parsedMessage.error.issues[0]?.message ?? "invalid payload",
        })
      );
      return;
    }
    const msg = parsedMessage.data;

    const configId = (await this.ctx.storage.get("config_id")) as string;
    const orgId = ((await this.ctx.storage.get("org_id")) as string) ?? "dev_org";
    const config = (await this.ctx.storage.get("config")) as Record<string, unknown> | undefined;

    const messageId = msg.message_id ?? `msg_${crypto.randomUUID()}`;
    this.insertMessage({
      messageId,
      role: "user",
      text: msg.text,
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

    await this.routeAndRunAgents({
      text: msg.text,
      messageId,
      explicitAgentIds: msg.agent_ids,
      origin: msg.origin ?? "user",
      configId,
      orgId,
      config,
      streamDeltas: true,
    });

    this.broadcast({ type: "done" });

    ContextManager.maybeCompact(
      this.ctx.storage.sql,
      config?.compaction_threshold as number | undefined
    );
  }

  private broadcast(event: ChatWsEvent): void {
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
      const rawBody = (await request.json()) as Record<string, unknown>;
      const bodyPayload = {
        ...rawBody,
        type: "message",
      };
      const parsedBody = chatMessageRequestSchema.safeParse(bodyPayload);
      if (!parsedBody.success) {
        return json(
          {
            ok: false,
            error: parsedBody.error.issues[0]?.message ?? "invalid payload",
          },
          400
        );
      }
      const body = parsedBody.data;

      const configId = (await this.ctx.storage.get("config_id")) as string;
      const orgId = ((await this.ctx.storage.get("org_id")) as string) ?? "dev_org";
      const config = (await this.ctx.storage.get("config")) as Record<string, unknown>;

      const messageId = body.message_id ?? `msg_${crypto.randomUUID()}`;
      const senderName: string | undefined = body.sender_name;
      const senderId: string | undefined = body.sender_id;

      this.insertMessage({
        messageId,
        role: "user",
        text: body.text,
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

      const { agentMessages } = await this.routeAndRunAgents({
        text: body.text,
        messageId,
        explicitAgentIds: body.agent_ids,
        origin: body.origin ?? "user",
        configId,
        orgId,
        config,
        streamDeltas: false,
      });

      this.broadcast({ type: "done" });

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
