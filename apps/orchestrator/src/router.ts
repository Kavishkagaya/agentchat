import {
  countOrgActiveGroups,
  getGroupRuntime,
  initializeGroupRuntime,
  listGroupsForAutoArchive,
  markGroupArchived,
  recordGroupArchive,
  touchGroupActivity,
  updateGroupRuntimeStatus,
} from "@axon/database";
import { createRoutingToken, verifyAppInfraToken, verifyRoutingToken } from "@axon/shared";
import type { Env } from "./env";

type HistoryMode = "internal" | "external";

interface GroupActivateRequest {
  group_id: string;
  history_mode?: HistoryMode;
  org_id: string;
}

interface RoutingTokenRequest {
  group_id: string;
  role?: string;
  user_id: string;
}

interface CleanupRequest {
  group_id: string;
  status?: "active" | "idle" | "archived";
}

interface GroupArchiveResponse {
  ok: boolean;
  snapshot?: Record<string, unknown>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    status
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
  path: string
): Promise<void> {
  const token = getBearerToken(request);
  await verifyAppInfraToken(env.APP_PUBLIC_KEY, token, {
    method: request.method,
    path,
  });
}

function resolveActiveGroupLimit(env: Env) {
  const configured = Number(env.MAX_ACTIVE_GROUPS_PER_ORG);
  return Number.isFinite(configured) && configured > 0 ? configured : 25;
}

function createGroupControllerHeaders(env: Env, headers?: HeadersInit) {
  const next = new Headers(headers);
  if (env.GC_SERVICE_TOKEN) {
    next.set("x-orchestrator-service-token", env.GC_SERVICE_TOKEN);
  }
  return next;
}

function archiveR2Path(groupId: string, at: Date) {
  return `groups/${groupId}/archives/${at.toISOString()}.json`;
}

async function archiveGroup(
  env: Env,
  groupId: string,
  reason: "manual" | "auto"
): Promise<void> {
  const archivedAt = new Date();
  const id = env.GROUP_CONTROLLER.idFromName(groupId);
  const stub = env.GROUP_CONTROLLER.get(id);
  const res = await stub.fetch("http://internal/archive", {
    method: "POST",
    headers: createGroupControllerHeaders(env, {
      "content-type": "application/json",
    }),
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`group archive failed: ${res.status} ${body}`);
  }

  const archivePayload = (await res.json()) as GroupArchiveResponse;
  if (!archivePayload.ok || !archivePayload.snapshot) {
    throw new Error("group archive failed: missing snapshot payload");
  }

  const snapshotBody = JSON.stringify(archivePayload.snapshot);
  const key = archiveR2Path(groupId, archivedAt);
  await env.ARCHIVES_BUCKET.put(key, snapshotBody, {
    httpMetadata: {
      contentType: "application/json",
    },
  });

  await recordGroupArchive({
    groupId,
    r2Path: key,
    sizeBytes: snapshotBody.length,
    at: archivedAt,
  });
  await markGroupArchived(groupId);
}

export async function handleRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ ok: true, service: "orchestrator", env: env.ENVIRONMENT });
  }

  if (request.method === "POST" && url.pathname === "/infra/groups") {
    try {
      await requireAppSignature(request, env, "/infra/groups");
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication"
      );
    }

    try {
      const body = await readJson<GroupActivateRequest>(request);
      const groupId = requireString(body.group_id, "group_id");
      const orgId = requireString(body.org_id, "org_id");
      const historyMode: HistoryMode =
        body.history_mode === "external" ? "external" : "internal";

      const existing = await getGroupRuntime(groupId);
      const activeCount = await countOrgActiveGroups(orgId, groupId);
      const activeLimit = resolveActiveGroupLimit(env);
      const alreadyActive =
        existing?.status === "active" || existing?.status === "idle";

      if (!alreadyActive && activeCount >= activeLimit) {
        return errorResponse(
          429,
          "active_group_limit_exceeded",
          `org reached active group limit (${activeLimit})`
        );
      }

      const doId = env.GROUP_CONTROLLER.idFromName(groupId);
      const doIdString = doId.toString();
      await initializeGroupRuntime(groupId, doIdString, null);

      const stub = env.GROUP_CONTROLLER.get(doId);
      const initResponse = await stub.fetch("http://internal/init", {
        method: "POST",
        headers: createGroupControllerHeaders(env, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          group_id: groupId,
          org_id: orgId,
          history_mode: historyMode,
        }),
      });

      if (!initResponse.ok) {
        const bodyText = await initResponse.text();
        return errorResponse(
          502,
          "group_controller_init_failed",
          bodyText || "failed to initialize group controller"
        );
      }

      await touchGroupActivity(groupId);

      return json({
        ok: true,
        group_controller_id: doIdString,
        history_mode: historyMode,
      });
    } catch (error) {
      return errorResponse(
        400,
        "invalid_request",
        error instanceof Error ? error.message : "invalid request"
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
        error instanceof Error ? error.message : "invalid authentication"
      );
    }

    try {
      const body = await readJson<RoutingTokenRequest>(request);
      const groupId = requireString(body.group_id, "group_id");
      const userId = requireString(body.user_id, "user_id");
      const role = typeof body.role === "string" ? body.role : "member";

      const token = await createRoutingToken(
        env.ORCHESTRATOR_PRIVATE_KEY,
        userId,
        groupId,
        role
      );

      return json({ ok: true, routing_token: token });
    } catch (error) {
      return errorResponse(
        400,
        "invalid_request",
        error instanceof Error ? error.message : "invalid request"
      );
    }
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/infra/groups/") &&
    url.pathname.endsWith("/archive")
  ) {
    const parts = url.pathname.split("/").filter(Boolean);
    const groupId = parts[2];
    if (!groupId) {
      return errorResponse(400, "invalid_request", "missing group id");
    }

    try {
      await requireAppSignature(request, env, url.pathname);
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication"
      );
    }

    try {
      await archiveGroup(env, groupId, "manual");
      return json({ ok: true, group_id: groupId, status: "archived" });
    } catch (error) {
      return errorResponse(
        500,
        "archive_failed",
        error instanceof Error ? error.message : "archive failed"
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/infra/cleanup") {
    try {
      await requireAppSignature(request, env, "/infra/cleanup");
    } catch (error) {
      return errorResponse(
        401,
        "unauthorized",
        error instanceof Error ? error.message : "invalid authentication"
      );
    }

    try {
      const body = await readJson<CleanupRequest>(request);
      const groupId = requireString(body.group_id, "group_id");
      const status = parseCleanupStatus(body.status);

      await updateGroupRuntimeStatus(groupId, status);

      return json({ ok: true, group_id: groupId, status });
    } catch (error) {
      return errorResponse(
        400,
        "cleanup_failed",
        error instanceof Error ? error.message : "cleanup request failed"
      );
    }
  }

  if (url.pathname.startsWith("/groups/") && url.pathname.endsWith("/ws")) {
    const groupId = url.pathname.split("/")[2];
    if (!groupId) {
      return new Response("Invalid group id", { status: 400 });
    }

    try {
      await requireAppSignature(request, env, url.pathname);
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : "Unauthorized",
        { status: 401 }
      );
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

    if (payload.group_id !== groupId) {
      return new Response("Routing token group mismatch", { status: 403 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    await touchGroupActivity(groupId);
    const doId = env.GROUP_CONTROLLER.idFromName(groupId);
    const stub = env.GROUP_CONTROLLER.get(doId);
    const forwardRequest = new Request(request, {
      headers: createGroupControllerHeaders(env, request.headers),
    });
    return stub.fetch(forwardRequest);
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/groups/") &&
    url.pathname.endsWith("/history")
  ) {
    const groupId = url.pathname.split("/")[2];
    if (!groupId) {
      return new Response("Invalid group id", { status: 400 });
    }

    try {
      await requireAppSignature(request, env, url.pathname);
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : "Unauthorized",
        { status: 401 }
      );
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

    if (payload.group_id !== groupId) {
      return new Response("Routing token group mismatch", { status: 403 });
    }

    await touchGroupActivity(groupId);
    const doId = env.GROUP_CONTROLLER.idFromName(groupId);
    const stub = env.GROUP_CONTROLLER.get(doId);
    const forwardRequest = new Request(request, {
      headers: createGroupControllerHeaders(env, request.headers),
    });
    return stub.fetch(forwardRequest);
  }

  return new Response("Not Found", { status: 404 });
}

export async function handleScheduled(
  _controller: ScheduledController,
  env: Env
): Promise<void> {
  const inactiveDays = Number(env.GROUP_AUTO_ARCHIVE_DAYS ?? "7");
  const thresholdDays = Number.isFinite(inactiveDays) && inactiveDays > 0 ? inactiveDays : 7;
  const candidates = await listGroupsForAutoArchive(thresholdDays);

  for (const group of candidates) {
    try {
      await archiveGroup(env, group.id, "auto");
    } catch (error) {
      console.warn("auto_archive_failed", {
        group_id: group.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
