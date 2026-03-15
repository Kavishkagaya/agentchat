import type {
  ChatActivateRequestPayload,
  CleanupRequestPayload,
  RoutingTokenRequestPayload,
} from "@axon/shared";
import { initDb, touchChatActivity } from "@axon/worker-database";
import { requireAppSignature } from "./auth/infra-auth";
import { requireRoutingToken } from "./auth/routing-auth";
import { controllerClient } from "./do/controller-client";
import type { Env } from "./env";
import {
  parseCleanupStatus,
  parseConfigId,
  readJson,
  requireString,
} from "./http/request";
import { errorMessage, errorResponse, json } from "./http/response";
import {
  activateChat,
  archiveChat,
  clearChatHistory,
  createRoutingToken,
  destroyChat,
  getHistory,
  syncChatConfig,
  updateChatStatus,
} from "./services/chat.service";
import { ServiceError } from "./services/errors";

function handleError(
  error: unknown,
  route: string,
  fallbackStatus: number,
  fallbackCode: string,
): Response {
  if (error instanceof ServiceError) {
    console.error(`[${route}] ServiceError ${error.status} ${error.code}:`, error.message);
    return errorResponse(error.status, error.code, error.message);
  }
  const msg = errorMessage(error);
  console.error(`[${route}] Unhandled error:`, msg, error);
  return errorResponse(fallbackStatus, fallbackCode, msg);
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
    if (!configId) {
      return errorResponse(
        400,
        "invalid_request",
        "missing configId in /dev route",
      );
    }
    return controllerClient.forward(env, configId, url.pathname, {
      method: request.method,
      body: request.body,
      preserveHeaders: request.headers,
    });
  }

  // --- INFRA ROUTES (Server-to-Server) ---

  if (request.method === "POST" && url.pathname === "/infra/chats") {
    try {
      const tokenPayload = await requireAppSignature(
        request,
        env,
        "/infra/chats",
      );
      const body = await readJson<ChatActivateRequestPayload>(request);
      const configId = requireString(body.config_id, "config_id");
      const orgId = tokenPayload.org_id;
      if (!orgId) {
        return errorResponse(400, "invalid_request", "missing org_id in token");
      }
      const result = await activateChat(env, {
        config_id: configId,
        org_id: orgId,
      });
      return json({ ok: true, ...result });
    } catch (error) {
      return handleError(error, "POST /infra/chats", 400, "invalid_request");
    }
  }

  if (request.method === "POST" && url.pathname === "/infra/routing-token") {
    try {
      const tokenPayload = await requireAppSignature(
        request,
        env,
        "/infra/routing-token",
      );
      const body = await readJson<RoutingTokenRequestPayload>(request);
      const configId = requireString(body.config_id, "config_id");
      const userId = tokenPayload.sub;
      const role = typeof body.role === "string" ? body.role : "member";
      const result = await createRoutingToken(env, {
        config_id: configId,
        user_id: userId,
        role,
      });
      return json({ ok: true, ...result });
    } catch (error) {
      return handleError(error, "POST /infra/routing-token", 400, "invalid_request");
    }
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/infra/chats/") &&
    url.pathname.endsWith("/archive")
  ) {
    const configId = url.pathname.split("/").filter(Boolean)[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireAppSignature(request, env, url.pathname);
      const result = await archiveChat(env, configId);
      return json({ ok: true, ...result });
    } catch (error) {
      return handleError(error, `POST /infra/chats/${configId}/archive`, 500, "archive_failed");
    }
  }

  if (
    request.method === "DELETE" &&
    url.pathname.startsWith("/infra/chats/") &&
    !url.pathname.endsWith("/archive") &&
    !url.pathname.endsWith("/history")
  ) {
    const configId = url.pathname.split("/").filter(Boolean)[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireAppSignature(request, env, url.pathname);
      await destroyChat(env, configId);
      return json({ ok: true });
    } catch (error) {
      return handleError(error, `DELETE /infra/chats/${configId}`, 500, "delete_failed");
    }
  }

  if (request.method === "POST" && url.pathname === "/infra/chats/cleanup") {
    try {
      await requireAppSignature(request, env, "/infra/chats/cleanup");
      const body = await readJson<CleanupRequestPayload>(request);
      const configId = requireString(body.config_id, "config_id");
      const status = parseCleanupStatus(body.status);
      const result = await updateChatStatus(env, {
        config_id: configId,
        status,
      });
      return json({ ok: true, ...result });
    } catch (error) {
      return handleError(error, "POST /infra/chats/cleanup", 400, "cleanup_failed");
    }
  }

  if (
    request.method === "DELETE" &&
    url.pathname.match(/^\/infra\/chats\/[^/]+\/history$/)
  ) {
    const configId = url.pathname.split("/").filter(Boolean)[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireAppSignature(request, env, url.pathname);
      await clearChatHistory(env, configId);
      return json({ ok: true });
    } catch (error) {
      return handleError(error, `DELETE /infra/chats/${configId}/history`, 500, "clear_history_failed");
    }
  }

  if (
    request.method === "GET" &&
    url.pathname.match(/^\/infra\/chats\/[^/]+\/history$/)
  ) {
    const configId = url.pathname.split("/").filter(Boolean)[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireAppSignature(request, env, url.pathname);
      return getHistory(env, configId, url.search);
    } catch (error) {
      return handleError(error, `GET /infra/chats/${configId}/history`, 401, "unauthorized");
    }
  }

  if (
    request.method === "POST" &&
    url.pathname.match(/^\/infra\/chats\/[^/]+\/sync-config$/)
  ) {
    const configId = url.pathname.split("/").filter(Boolean)[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireAppSignature(request, env, url.pathname);
      const body = await readJson<{ config: Record<string, unknown> }>(request);
      if (!body.config) {
        return errorResponse(400, "invalid_request", "missing config");
      }
      const result = await syncChatConfig(env, configId, body.config);
      return json(result);
    } catch (error) {
      return handleError(error, `POST /infra/chats/${configId}/sync-config`, 500, "config_sync_failed");
    }
  }

  // --- CLIENT ROUTES (User/Browser) ---

  if (url.pathname.startsWith("/chats/") && url.pathname.endsWith("/ws")) {
    const configId = url.pathname.split("/")[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireRoutingToken(
        request,
        url,
        env.ORCHESTRATOR_PUBLIC_KEY,
        configId,
      );
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }
    await touchChatActivity(configId);
    return controllerClient.websocket(env, configId, request.headers);
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/chats/") &&
    url.pathname.endsWith("/history")
  ) {
    const configId = url.pathname.split("/")[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireRoutingToken(
        request,
        url,
        env.ORCHESTRATOR_PUBLIC_KEY,
        configId,
      );
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    await touchChatActivity(configId);
    return controllerClient.getMessages(env, configId, url.search);
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/chats/") &&
    url.pathname.endsWith("/messages")
  ) {
    const configId = url.pathname.split("/")[2];
    if (!configId) {
      return errorResponse(400, "invalid_request", "missing chat id");
    }
    try {
      await requireRoutingToken(
        request,
        url,
        env.ORCHESTRATOR_PUBLIC_KEY,
        configId,
      );
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    await touchChatActivity(configId);
    return controllerClient.postMessage(env, configId, request.body);
  }

  return new Response("Not Found", { status: 404 });
}

export async function handleScheduled(
  _controller: ScheduledController,
  _env: Env,
): Promise<void> {
  // Auto-archive is disabled
}
