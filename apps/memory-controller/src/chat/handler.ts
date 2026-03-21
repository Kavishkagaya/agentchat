import {
  type AgentChatContext,
  type AgentUsage,
  buildAgentChatContext,
  buildMentionMap,
  type ChatRoutingConfig,
  type ChatWsEvent,
  chatMessageRequestSchema,
  createAgentAccessToken,
  type MessageOrigin,
  normalizeChatRoutingConfig,
  normalizeNickname,
} from "@axon/shared";
import { asc, desc, eq, lt, sql } from "drizzle-orm";
import {
  type DrizzleSqliteDODatabase,
  drizzle,
} from "drizzle-orm/durable-sqlite";

import { ContextManager } from "../context-manager";
import type { Env } from "../index";
import * as schema from "../schema";
import { getTriggerDepthLimit, resolveChatTargets } from "./decision-maker";

export class ChatHandler {
  private db: DrizzleSqliteDODatabase<typeof schema>;
  private contextManager: ContextManager;

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    this.db = drizzle(ctx.storage, { schema });
    this.contextManager = new ContextManager(this.db);
  }

  async ensureSchema() {
    // Drizzle migrations are applied idempotently via the migrate() call
    // This tracks which migrations have been applied in the __drizzle_migrations table
    // The bundled migrations are generated from the schema via: npm run db:generate
    const { migrate } = await import("drizzle-orm/durable-sqlite/migrator");
    const migrationConfig = await import("../../drizzle/migrations");
    migrate(this.db, migrationConfig.default);
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
    const createdAt = new Date().toISOString();
    const tokens = params.tokens ?? ContextManager.estimateTokens(params.text);

    this.db
      .insert(schema.messages)
      .values({
        message_id: params.messageId,
        role: params.role,
        text: params.text,
        agent_id: params.agentId ?? null,
        agent_nickname: params.agentNickname ?? null,
        sender_id: params.senderId ?? null,
        sender_name: params.senderName ?? null,
        tokens,
        created_at: createdAt,
      })
      .run();

    // Context messages include attribution so the LLM knows who said what
    let contextText = params.text;
    if (params.role === "assistant" && params.agentNickname) {
      contextText = `[${params.agentNickname}]: ${params.text}`;
    } else if (params.role === "user" && params.senderName) {
      contextText = `[${params.senderName}]: ${params.text}`;
    }

    this.contextManager.insertContextMessage({
      role: params.role,
      text: contextText,
      tokens,
      created_at: createdAt,
    });

    return { ...params, tokens, created_at: createdAt };
  }

  private insertEvent(messageId: string, eventType: string, data: unknown) {
    this.db
      .insert(schema.messageEvents)
      .values({
        message_id: messageId,
        event_type: eventType,
        data: JSON.stringify(data),
        created_at: new Date().toISOString(),
      })
      .run();
  }

  public listMessages(params?: { cursor?: string; limit?: number }) {
    const limit = Math.min(params?.limit ?? 50, 200);
    const cursor = params?.cursor ?? new Date().toISOString();

    const rows = this.db
      .select()
      .from(schema.messages)
      .where(lt(schema.messages.created_at, cursor))
      .orderBy(desc(schema.messages.created_at))
      .limit(limit)
      .all();

    const has_more = rows.length === limit;
    const next_cursor =
      rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return {
      messages: rows.reverse(),
      next_cursor,
      has_more,
    };
  }

  public getMessageEvents(messageId: string) {
    return this.db
      .select({
        event_type: schema.messageEvents.event_type,
        data: schema.messageEvents.data,
        created_at: schema.messageEvents.created_at,
      })
      .from(schema.messageEvents)
      .where(eq(schema.messageEvents.message_id, messageId))
      .orderBy(asc(schema.messageEvents.id))
      .all();
  }

  // SSE line parser — shared by both methods
  private async *consumeSSE(
    response: Response,
  ): AsyncGenerator<{ event: string; data: unknown }> {
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
          } catch (err) {
            // Log malformed JSON for debugging
            console.warn("consumeSSE: malformed JSON on line:", line, err);
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
    orgId: string,
    chatContext?: AgentChatContext,
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

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) headers.authorization = `Bearer ${token}`;

    return {
      headers,
      body: JSON.stringify({
        agent_id: agentId,
        config_id: configId,
        prompt,
        messages: context,
        chat_context: chatContext,
      }),
    };
  }

  // Coarse stream: /agents/run — events in real-time, but text only in final
  public async *invokeAgentCoarse(
    agentId: string,
    prompt: string,
    context: Array<{ role: string; content: string }>,
    configId: string,
    orgId: string,
    chatContext?: AgentChatContext,
  ): AsyncGenerator<{ event: string; data: unknown }> {
    const baseUrl = this.env.AGENTS_BASE_URL;
    if (!baseUrl) {
      console.error("invokeAgentCoarse: AGENTS_BASE_URL is not configured");
      throw new Error("AGENTS_BASE_URL not configured");
    }

    const opts = await this.buildAgentFetchOptions(
      agentId,
      prompt,
      context,
      configId,
      orgId,
      chatContext,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agents/run`, {
        method: "POST",
        signal: controller.signal,
        ...opts,
      });

      if (!res.ok) {
        console.error(`Agent ${agentId} run failed: ${res.status}`);
        throw new Error(`Agent HTTP ${res.status}`);
      }

      yield* this.consumeSSE(res);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Fine stream: /agents/run-stream — token-by-token text_delta events
  public async *invokeAgentStream(
    agentId: string,
    prompt: string,
    context: Array<{ role: string; content: string }>,
    configId: string,
    orgId: string,
    chatContext?: AgentChatContext,
  ): AsyncGenerator<{ event: string; data: unknown }> {
    const baseUrl = this.env.AGENTS_BASE_URL;
    if (!baseUrl) {
      console.error("invokeAgentStream: AGENTS_BASE_URL is not configured");
      throw new Error("AGENTS_BASE_URL not configured");
    }

    const opts = await this.buildAgentFetchOptions(
      agentId,
      prompt,
      context,
      configId,
      orgId,
      chatContext,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(
        `${baseUrl.replace(/\/$/, "")}/agents/run-stream`,
        {
          method: "POST",
          signal: controller.signal,
          ...opts,
        },
      );

      if (!res.ok) {
        console.error(`Agent ${agentId} stream failed: ${res.status}`);
        throw new Error(`Agent HTTP ${res.status}`);
      }

      yield* this.consumeSSE(res);
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveAgentNickname(
    agentId: string,
    config: ChatRoutingConfig | undefined,
  ): string {
    return (
      config?.agent_setups?.find((s) => s.agentId === agentId)?.nickname ??
      agentId
    );
  }

  /**
   * Parse an SSE { event, data } pair into a typed AgentSseEvent.
   * Returns undefined for unrecognised event names.
   */
  private static parseSseEvent(
    event: string,
    data: unknown,
  ): import("@axon/shared").AgentSseEvent | undefined {
    // The SSE event name maps 1:1 to AgentSseEvent.type — attach it and return.
    const obj = (
      typeof data === "object" && data !== null ? data : {}
    ) as Record<string, unknown>;
    return { type: event, ...obj } as import("@axon/shared").AgentSseEvent;
  }

  public async processAgentEvents(
    agentId: string,
    eventStream: AsyncGenerator<{ event: string; data: unknown }>,
    options: {
      broadcast: boolean;
      streamDeltas: boolean;
      config?: ChatRoutingConfig;
    },
  ): Promise<{
    text: string;
    agent_nickname: string;
    usage: AgentUsage | null;
    agent_id: string;
    message_id: string;
    invocations: Array<{ nickname: string }>;
  } | null> {
    const agentMsgId = `msg_${crypto.randomUUID()}`;
    let finalResult: {
      text: string;
      agent_nickname: string;
      usage: AgentUsage | null;
      invocations: Array<{ nickname: string }>;
    } | null = null;
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
            agent_nickname: knownNickname,
            usage: evt.usage,
            invocations: evt.invocations ?? [],
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

    const agentNickname = knownNickname;

    // Strip "[AgentName]: " prefix that agents echo back from context format
    // Only strip if the prefix matches a known agent nickname in the config
    let cleanText = finalResult.text;
    const knownNicknames =
      options.config?.agent_setups?.map((s) => s.nickname) ?? [];
    const bracketPrefix = cleanText.match(/^\[(.+?)\]:\s*/);
    if (bracketPrefix && knownNicknames.includes(bracketPrefix[1])) {
      cleanText = cleanText.slice(bracketPrefix[0].length);
    }

    this.insertMessage({
      messageId: agentMsgId,
      role: "assistant",
      text: cleanText,
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
        text: cleanText,
      });
    }

    return {
      ...finalResult,
      text: cleanText,
      agent_id: agentId,
      message_id: agentMsgId,
      invocations: finalResult.invocations,
    };
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
    // Track agents currently running — prevents the same agent being queued
    // twice concurrently. Removed once the agent finishes so it can be
    // re-triggered in a later round.
    const runningAgents = new Set<string>();
    const queue = initialDecision.targetAgentIds.map((agentId) => {
      runningAgents.add(agentId);
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

      const agentNickname = this.resolveAgentNickname(
        current.agentId,
        initialDecision.config,
      );
      const chatContext = buildAgentChatContext({
        agentNickname,
        agentSetups: initialDecision.config.agent_setups ?? [],
      });

      const context = this.contextManager.assembleContext();

      const eventStream = params.streamDeltas
        ? this.invokeAgentStream(
            current.agentId,
            current.prompt,
            context,
            params.configId,
            params.orgId,
            chatContext,
          )
        : this.invokeAgentCoarse(
            current.agentId,
            current.prompt,
            context,
            params.configId,
            params.orgId,
            chatContext,
          );

      const result = await this.processAgentEvents(
        current.agentId,
        eventStream,
        {
          broadcast: true,
          streamDeltas: params.streamDeltas,
          config: initialDecision.config,
        },
      );

      // Agent finished — remove from running set so it can be re-triggered later
      runningAgents.delete(current.agentId);

      if (!result) continue;

      agentMessages.push(result);

      if (current.depth >= maxDepth) {
        this.insertEvent(result.message_id, "routing_depth_cap", {
          depth: current.depth,
          max_depth: maxDepth,
        });
        continue;
      }

      const mentionMap = {
        ...(initialDecision.config.mention_map ?? {}),
        ...buildMentionMap(initialDecision.config.agent_setups ?? []),
      };

      this.insertEvent(result.message_id, "routing_decision", {
        origin: "agent",
        source: "invoke_agent_tool",
        targets: result.invocations.map((i) => i.nickname),
      });

      const unknownMentions: string[] = [];
      for (const inv of result.invocations) {
        const normalized = normalizeNickname(inv.nickname);
        const targetAgentId = mentionMap[normalized];

        if (!targetAgentId) {
          unknownMentions.push(inv.nickname);
          continue;
        }
        // No self-invocation
        if (targetAgentId === current.agentId) continue;
        // Skip if this agent is already queued / running
        if (runningAgents.has(targetAgentId)) continue;
        if (current.depth >= maxDepth) {
          this.insertEvent(result.message_id, "routing_depth_cap", {
            depth: current.depth,
            max_depth: maxDepth,
          });
          continue;
        }

        runningAgents.add(targetAgentId);
        queue.push({
          agentId: targetAgentId,
          prompt: result.text,
          depth: current.depth + 1,
        });
      }

      if (unknownMentions.length > 0) {
        this.insertEvent(result.message_id, "routing_warning", {
          unknown_mentions: unknownMentions,
          source: "invoke_agent_tool",
          origin: "agent",
        });
      }
    }

    return { agentMessages };
  }

  public async handleWebSocketMessage(
    ws: WebSocket,
    rawMessage: string | ArrayBuffer,
  ): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        typeof rawMessage === "string"
          ? rawMessage
          : new TextDecoder().decode(rawMessage),
      );
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "parse_error",
          message: "invalid JSON",
        }),
      );
      return;
    }

    const parsedMessage = chatMessageRequestSchema.safeParse(parsed);
    if (!parsedMessage.success) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "invalid_message",
          message: parsedMessage.error.issues[0]?.message ?? "invalid payload",
        }),
      );
      return;
    }
    const msg = parsedMessage.data;

    const configId = (await this.ctx.storage.get("config_id")) as string;
    const orgId =
      ((await this.ctx.storage.get("org_id")) as string) ?? "dev_org";
    const rawConfig = (await this.ctx.storage.get("config")) as
      | Record<string, unknown>
      | undefined;
    const config = rawConfig
      ? normalizeChatRoutingConfig(rawConfig)
      : undefined;

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

    // Compact BEFORE broadcasting done so clients don't disconnect mid-compaction
    this.contextManager.maybeCompact(
      config?.compaction_threshold as number | undefined,
    );

    this.broadcast({ type: "done" });
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

  public clearHistory() {
    this.db.delete(schema.messages).run();
    this.db.delete(schema.contextMessages).run();
    this.db.delete(schema.messageEvents).run();
  }

  async handle(request: Request, route: string): Promise<Response> {
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (
      request.method === "GET" &&
      (route === "/messages" || route === "/history")
    ) {
      const url = new URL(request.url);
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const limit = url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!, 10)
        : undefined;
      return json({ ...this.listMessages({ cursor, limit }), type: "chat" });
    }

    if (
      request.method === "GET" &&
      route.match(/^\/messages\/[^/]+\/events$/)
    ) {
      const messageId = route.split("/")[2];
      return json({ events: this.getMessageEvents(messageId) });
    }

    if (request.method === "DELETE" && route === "/messages") {
      this.clearHistory();
      this.broadcast({ type: "history_cleared" });
      return json({ ok: true });
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
          400,
        );
      }
      const body = parsedBody.data;

      const configId = (await this.ctx.storage.get("config_id")) as string;
      const orgId =
        ((await this.ctx.storage.get("org_id")) as string) ?? "dev_org";
      const rawConfig = (await this.ctx.storage.get("config")) as
        | Record<string, unknown>
        | undefined;
      const config = rawConfig
        ? normalizeChatRoutingConfig(rawConfig)
        : undefined;

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

      // Compact BEFORE broadcasting done so clients don't disconnect mid-compaction
      this.contextManager.maybeCompact(
        config?.compaction_threshold as number | undefined,
      );

      this.broadcast({ type: "done" });

      return json({
        ok: true,
        message_id: messageId,
        agent_messages: agentMessages,
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}
