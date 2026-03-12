import {
  countOrgActiveChats,
  deleteChatRuntime,
  getChatRuntime,
  initDb,
  initializeChatRuntime,
  markChatArchived,
  recordChatArchive,
  touchChatActivity,
  updateChatRuntimeStatus,
} from "@axon/worker-database";
import {
  type ChatActivateRequestPayload,
  createRoutingToken,
  type HistoryMode,
  type RoutingTokenRequestPayload,
  sign,
  verifyAppInfraToken,
  verifyRoutingToken,
} from "@axon/shared";
import type { Env } from "./env";

interface CleanupRequest {
  config_id: string;
  status?: "active" | "idle" | "archived";
}

interface ChatArchiveResponse {
  ok: boolean;
  snapshot?: Record<string, unknown>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    status,
  );
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
    throw new Error(`missing required field: ${field}`);
  }
  return value;
}

function getBearerToken(request: Request): string {
  const raw = request.headers.get("authorization");
  if (!raw) {
    throw new Error("missing authorization header");
  }
  const [scheme, token] = raw.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new Error("invalid authorization header");
  }
  return token;
}

function parseCleanupStatus(value: unknown): "active" | "archived" | "idle" {
  if (value === undefined) {
    return "idle";
  }
  if (value === "active" || value === "idle" || value === "archived") {
    return value;
  }
  throw new Error("invalid status");
}

async function requireAppSignature(
  request: Request,
  env: Env,
  path: string,
): Promise<void> {
  const token = getBearerToken(request);
  await verifyAppInfraToken(env.APP_PUBLIC_KEY, token, { method: request.method, path });
}

async function createMemoryControllerHeaders(
  env: Env,
  extra: Record<string, string | null> = {},
): Promise<Headers> {
  const headers = new Headers();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "orchestrator",
    iat: now,
    exp: now + 60,
    jti: crypto.randomUUID(),
  };
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = await sign(env.ORCHESTRATOR_PRIVATE_KEY, encodedPayload);
  headers.set("Authorization", `Bearer ${encodedPayload}.${signature}`);
  for (const [key, value] of Object.entries(extra)) {
    if (value) headers.set(key, value);
  }
  return headers;
}

function parseConfigId(pathname: string, prefix: string) {
  const parts = pathname.split("/");
  const idx = parts.indexOf(prefix.replace(/\//g, ""));
  if (idx !== -1 && parts.length > idx + 1) {
    return parts[idx + 1];
  }
  return null;
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (env.NEON_DATABASE_URL) {
    initDb(env.NEON_DATABASE_URL);
  }

  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "orchestrator" });
  }

  // Dev Routes (Only available in development)
  if (env.ENVIRONMENT === "dev" && url.pathname.startsWith("/dev/")) {
    const configId = parseConfigId(url.pathname, "dev");
    if (!configId)
      return new Response("Missing configId in /dev route", { status: 400 });

    const id = env.MEMORY_CONTROLLER.idFromName(configId);
    const stub = env.MEMORY_CONTROLLER.get(id);

    return stub.fetch(request);
  }

  // --- INFRA ROUTES (Server-to-Server) ---

  if (request.method === "POST" && url.pathname === "/infra/chats") {
    try {
      await requireAppSignature(request, env, "/infra/chats");
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication",
      );
    }

    try {
      const body = await readJson<ChatActivateRequestPayload>(request);
      const configId = requireString(body.config_id, "config_id");
      const orgId = requireString(body.org_id, "org_id");
      const historyMode = body.history_mode ?? "internal";

      const activeLimit = Number(env.ORG_ACTIVE_GROUP_LIMIT ?? "5");
      const activeCount = await countOrgActiveChats(orgId, configId);
      const existingRuntime = await getChatRuntime(configId);
      const alreadyActive =
        existingRuntime && existingRuntime.status !== "archived";

      if (!alreadyActive && activeCount >= activeLimit) {
        return errorResponse(
          429,
          "active_chat_limit_exceeded",
          `org reached active chat limit (${activeLimit})`,
        );
      }

      const doId = env.MEMORY_CONTROLLER.idFromName(configId);
      const doIdString = doId.toString();
      await initializeChatRuntime(configId, doIdString, null);

      const stub = env.MEMORY_CONTROLLER.get(doId);
      const initHeaders = await createMemoryControllerHeaders(env, {
        "content-type": "application/json",
      });
      const initResponse = await stub.fetch("http://internal/chats/init", {
        method: "POST",
        headers: initHeaders,
        body: JSON.stringify({
          config_id: configId,
          org_id: orgId,
          type: "chat",
          history_mode: historyMode,
        }),
      });

      if (!initResponse.ok) {
        const bodyText = await initResponse.text();
        return errorResponse(
          502,
          "memory_controller_init_failed",
          bodyText || "failed to initialize chat controller",
        );
      }

      let initPayload: { config_source?: string; ok?: boolean } | null = null;
      try {
        initPayload = (await initResponse.json()) as { config_source?: string; ok?: boolean };
      } catch {
        initPayload = null;
      }

      if (!initPayload || initPayload.config_source !== "database") {
        return errorResponse(
          502,
          "memory_controller_init_source_invalid",
          "memory controller init must use persisted database config",
        );
      }

      await touchChatActivity(configId);

      return json({
        ok: true,
        memory_controller_id: doIdString,
        history_mode: historyMode,
      });
    } catch (error) {
      return errorResponse(
        400,
        "invalid_request",
        error instanceof Error ? error.message : "invalid request",
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/infra/routing-token") {
    try {
      await requireAppSignature(request, env, "/infra/routing-token");
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication",
      );
    }

    try {
      const body = await readJson<RoutingTokenRequestPayload>(request);
      const configId = requireString(body.config_id, "config_id");
      const userId = requireString(body.user_id, "user_id");
      const role = typeof body.role === "string" ? body.role : "member";

      const token = await createRoutingToken(
        env.ORCHESTRATOR_PRIVATE_KEY,
        userId,
        configId,
        role,
      );

      return json({ ok: true, routing_token: token });
    } catch (error) {
      return errorResponse(
        400,
        "invalid_request",
        error instanceof Error ? error.message : "invalid request",
      );
    }
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/infra/chats/") &&
    url.pathname.endsWith("/archive")
  ) {
    const parts = url.pathname.split("/").filter(Boolean);
    const configId = parts[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }

    try {
      await requireAppSignature(request, env, url.pathname);
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication",
      );
    }

    try {
      const doId = env.MEMORY_CONTROLLER.idFromName(configId);
      const stub = env.MEMORY_CONTROLLER.get(doId);

      const archiveHeaders = await createMemoryControllerHeaders(env);
      const archiveRequest = new Request(
        `http://internal/chats/${configId}/archive`,
        {
          method: "POST",
          headers: archiveHeaders,
        },
      );

      const res = await stub.fetch(archiveRequest);
      if (!res.ok) {
        throw new Error(await res.text());
      }

      const body = await res.json<ChatArchiveResponse>();
      if (!body.snapshot) {
        throw new Error("missing snapshot in archive response");
      }

      const snapshotKey = `chats/${configId}/archives/${Date.now()}.json`;
      await env.ARCHIVES_BUCKET.put(snapshotKey, JSON.stringify(body.snapshot));

      await recordChatArchive({
        chatId: configId,
        r2Path: snapshotKey,
        sizeBytes: JSON.stringify(body.snapshot).length,
      });

      await markChatArchived(configId);

      return json({ ok: true, r2_path: snapshotKey });
    } catch (error) {
      return errorResponse(
        500,
        "archive_failed",
        error instanceof Error ? error.message : "archive failed",
      );
    }
  }

  // DELETE /infra/chats/:id — destroy DO + delete all DB records
  if (
    request.method === "DELETE" &&
    url.pathname.startsWith("/infra/chats/") &&
    !url.pathname.endsWith("/archive") &&
    !url.pathname.endsWith("/history")
  ) {
    const parts = url.pathname.split("/").filter(Boolean);
    const configId = parts[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }

    try {
      await requireAppSignature(request, env, url.pathname);
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication",
      );
    }

    try {
      // 1. Destroy DO SQLite + storage
      const doId = env.MEMORY_CONTROLLER.idFromName(configId);
      const stub = env.MEMORY_CONTROLLER.get(doId);
      const destroyHeaders = await createMemoryControllerHeaders(env);
      const destroyRequest = new Request(
        `http://internal/chats/${configId}/destroy`,
        {
          method: "POST",
          headers: destroyHeaders,
        },
      );
      const res = await stub.fetch(destroyRequest);
      if (!res.ok) {
        const text = await res.text();
        console.error("DO destroy failed:", text);
        // Continue with DB cleanup even if DO destroy fails
      }

      // 2. Delete all DB records
      await deleteChatRuntime(configId);

      return json({ ok: true });
    } catch (error) {
      return errorResponse(
        500,
        "delete_failed",
        error instanceof Error ? error.message : "delete failed",
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/infra/chats/cleanup") {
    try {
      await requireAppSignature(request, env, "/infra/chats/cleanup");
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication",
      );
    }

    try {
      const body = await readJson<CleanupRequest>(request);
      const configId = requireString(body.config_id, "config_id");
      const status = parseCleanupStatus(body.status);

      await updateChatRuntimeStatus(configId, status);

      return json({ ok: true, config_id: configId, status });
    } catch (error) {
      return errorResponse(
        400,
        "cleanup_failed",
        error instanceof Error ? error.message : "cleanup request failed",
      );
    }
  }

  // GET /infra/chats/:id/history — server-to-server history fetch
  if (
    request.method === "GET" &&
    url.pathname.match(/^\/infra\/chats\/[^/]+\/history$/)
  ) {
    const parts = url.pathname.split("/").filter(Boolean);
    const configId = parts[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }

    try {
      await requireAppSignature(request, env, url.pathname);
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication",
      );
    }

    const doId = env.MEMORY_CONTROLLER.idFromName(configId);
    const stub = env.MEMORY_CONTROLLER.get(doId);

    const queryString = url.search;
    const historyHeaders = await createMemoryControllerHeaders(env);
    const forwardRequest = new Request(
      `http://internal/chats/${configId}/messages${queryString}`,
      {
        method: "GET",
        headers: historyHeaders,
      },
    );
    return stub.fetch(forwardRequest);
  }

  // --- CLIENT ROUTES (User/Browser) ---

  if (url.pathname.startsWith("/chats/") && url.pathname.endsWith("/ws")) {
    const configId = url.pathname.split("/")[2];
    if (!configId) {
      return new Response("Invalid chat id", { status: 400 });
    }

    const token =
      url.searchParams.get("token") ?? request.headers.get("x-routing-token");
    if (!token) {
      return new Response("Missing routing token", { status: 401 });
    }

    let payload: Awaited<ReturnType<typeof verifyRoutingToken>>;
    try {
      payload = await verifyRoutingToken(env.ORCHESTRATOR_PUBLIC_KEY, token);
    } catch {
      return new Response("Invalid routing token", { status: 403 });
    }

    if (payload.config_id !== configId) {
      return new Response("Routing token chat mismatch", { status: 403 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    await touchChatActivity(configId);
    const doId = env.MEMORY_CONTROLLER.idFromName(configId);
    const stub = env.MEMORY_CONTROLLER.get(doId);

    // Preserve original request's WebSocket upgrade semantics and overlay auth headers
    const authHeaders = await createMemoryControllerHeaders(env);
    const forwardHeaders = new Headers(request.headers);
    for (const [key, value] of authHeaders.entries()) {
      forwardHeaders.set(key, value);
    }

    const forwardRequest = new Request(
      `http://internal/chats/${configId}/ws`,
      {
        method: "GET",
        headers: forwardHeaders,
      },
    );
    return stub.fetch(forwardRequest);
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/chats/") &&
    url.pathname.endsWith("/history")
  ) {
    const configId = url.pathname.split("/")[2];
    if (!configId) {
      return new Response("Invalid chat id", { status: 400 });
    }

    const token =
      url.searchParams.get("token") ?? request.headers.get("x-routing-token");
    if (!token) {
      return new Response("Missing routing token", { status: 401 });
    }

    let payload: Awaited<ReturnType<typeof verifyRoutingToken>>;
    try {
      payload = await verifyRoutingToken(env.ORCHESTRATOR_PUBLIC_KEY, token);
    } catch {
      return new Response("Invalid routing token", { status: 403 });
    }

    if (payload.config_id !== configId) {
      return new Response("Routing token chat mismatch", { status: 403 });
    }

    await touchChatActivity(configId);
    const doId = env.MEMORY_CONTROLLER.idFromName(configId);
    const stub = env.MEMORY_CONTROLLER.get(doId);
    const clientHistoryHeaders = await createMemoryControllerHeaders(env);
    const forwardRequest = new Request(
      `http://internal/chats/${configId}/messages${url.search}`,
      {
        method: "GET",
        headers: clientHistoryHeaders,
      },
    );
    return stub.fetch(forwardRequest);
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/chats/") &&
    url.pathname.endsWith("/messages")
  ) {
    const configId = url.pathname.split("/")[2];
    if (!configId) {
      return new Response("Invalid chat id", { status: 400 });
    }

    const token =
      request.headers.get("x-routing-token") ?? url.searchParams.get("token");
    if (!token) {
      return new Response("Missing routing token", { status: 401 });
    }

    let payload: Awaited<ReturnType<typeof verifyRoutingToken>>;
    try {
      payload = await verifyRoutingToken(env.ORCHESTRATOR_PUBLIC_KEY, token);
    } catch {
      return new Response("Invalid routing token", { status: 403 });
    }

    if (payload.config_id !== configId) {
      return new Response("Routing token chat mismatch", { status: 403 });
    }

    await touchChatActivity(configId);

    const doId = env.MEMORY_CONTROLLER.idFromName(configId);
    const stub = env.MEMORY_CONTROLLER.get(doId);
    const postHeaders = await createMemoryControllerHeaders(env, {
      "content-type": "application/json",
    });
    const forwardRequest = new Request(
      `http://internal/chats/${configId}/messages`,
      {
        method: "POST",
        headers: postHeaders,
        body: request.body,
      },
    );
    return stub.fetch(forwardRequest);
  }

  return new Response("Not Found", { status: 404 });
}

export async function handleScheduled(
  _controller: ScheduledController,
  _env: Env,
): Promise<void> {
  // Auto-archive is disabled
}
