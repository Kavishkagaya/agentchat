import { initializeGroupRuntime } from "@axon/database";
import {
  createRoutingToken,
  createSessionCert,
  generateKeyPair,
  verifyRoutingToken,
} from "@axon/shared";
import type { Env } from "./env";

// --- Types ---

export interface GroupActivateRequest {
  group_id: string;
  org_id: string;
}

export interface RoutingTokenRequest {
  group_id: string;
  user_id: string;
}

// --- Helpers ---

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  return await request.json();
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function requireString(value: any, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing required field: ${name}`);
  }
}

export async function handleRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);

  // Health Check
  if (url.pathname === "/health") {
    return json({ ok: true, service: "orchestrator", env: env.ENVIRONMENT });
  }

  // 1. Activate Group Session (App -> Orchestrator)
  if (request.method === "POST" && url.pathname === "/infra/groups") {
    let body: GroupActivateRequest;
    try {
      body = await readJson<GroupActivateRequest>(request);
      requireString(body.group_id, "group_id");
      requireString(body.org_id, "org_id");
    } catch (error) {
      return badRequest(
        error instanceof Error ? error.message : "invalid request"
      );
    }

    // 1. Generate Session Keys
    const sessionKeys = await generateKeyPair();

    // 2. Create Session Certificate
    if (!env.ORCHESTRATOR_PRIVATE_KEY) {
      return json({ error: "Orchestrator private key not configured" }, 500);
    }

    const sessionCert = await createSessionCert(
      env.ORCHESTRATOR_PRIVATE_KEY,
      body.group_id,
      sessionKeys.publicKey
    );

    // 3. Determine Group Controller ID
    const doId = env.GROUP_CONTROLLER.idFromName(body.group_id);
    const doIdString = doId.toString();

    // 4. Update Database (Store Public Key for verification)
    await initializeGroupRuntime(
      body.group_id,
      doIdString,
      sessionKeys.publicKey
    );

    // 5. Initialize DO (Push keys)
    const stub = env.GROUP_CONTROLLER.get(doId);
    const initRes = await stub.fetch("http://internal/init", {
      method: "POST",
      body: JSON.stringify({
        session_private_key: sessionKeys.privateKey,
        session_certificate: sessionCert,
      }),
      headers: { "Content-Type": "application/json" },
    });

    if (!initRes.ok) {
      return json({ error: "Failed to initialize Group Controller" }, 500);
    }

    return json({
      group_controller_id: doIdString,
      session_certificate: sessionCert,
    });
  }

  // 2. Issue Routing Token (App -> Orchestrator)
  if (request.method === "POST" && url.pathname === "/infra/routing-token") {
    let body: RoutingTokenRequest;
    try {
      body = await readJson<RoutingTokenRequest>(request);
      requireString(body.group_id, "group_id");
      requireString(body.user_id, "user_id");
    } catch (error) {
      return badRequest(
        error instanceof Error ? error.message : "invalid request"
      );
    }

    // Check Membership in DB (assume App checked or use a service if available)
    const role = "member";

    if (!env.ORCHESTRATOR_PRIVATE_KEY) {
      return json({ error: "Orchestrator private key not configured" }, 500);
    }

    const token = await createRoutingToken(
      env.ORCHESTRATOR_PRIVATE_KEY,
      body.user_id,
      body.group_id,
      role
    );

    return json({ routing_token: token });
  }

  // 3. WebSocket Gateway (User -> Group Controller)
  if (url.pathname.startsWith("/groups/") && url.pathname.endsWith("/ws")) {
    const groupId = url.pathname.split("/")[2];
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    if (!env.ORCHESTRATOR_PUBLIC_KEY) {
      return new Response("Orchestrator public key not configured", {
        status: 500,
      });
    }

    try {
      const payload = await verifyRoutingToken(
        env.ORCHESTRATOR_PUBLIC_KEY,
        token
      );

      if (payload.group_id !== groupId) {
        return new Response("Token mismatch", { status: 403 });
      }

      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      const doId = env.GROUP_CONTROLLER.idFromName(groupId);
      const stub = env.GROUP_CONTROLLER.get(doId);

      return stub.fetch(request);
    } catch (e) {
      return new Response("Invalid token", { status: 403 });
    }
  }

  // 4. HTTP Proxy (History) (User -> Group Controller)
  if (
    request.method === "GET" &&
    url.pathname.startsWith("/groups/") &&
    url.pathname.endsWith("/history")
  ) {
    const groupId = url.pathname.split("/")[2];
    const token =
      request.headers.get("X-Routing-Token") || url.searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 401 });
    }
    if (!env.ORCHESTRATOR_PUBLIC_KEY) {
      return new Response("Config error", { status: 500 });
    }

    try {
      const payload = await verifyRoutingToken(
        env.ORCHESTRATOR_PUBLIC_KEY,
        token
      );
      if (payload.group_id !== groupId) {
        return new Response("Token mismatch", { status: 403 });
      }

      const doId = env.GROUP_CONTROLLER.idFromName(groupId);
      const stub = env.GROUP_CONTROLLER.get(doId);
      return stub.fetch(request);
    } catch (e) {
      return new Response("Invalid token", { status: 403 });
    }
  }

  // 5. Cleanup Callback (Group Controller -> Orchestrator)
  if (request.method === "POST" && url.pathname === "/infra/cleanup") {
    return json({ status: "cleaned" });
  }

  return new Response("Not Found", { status: 404 });
}

export async function handleScheduled(
  controller: ScheduledController,
  env: Env
): Promise<void> {
  // Periodic cleanup logic
}
