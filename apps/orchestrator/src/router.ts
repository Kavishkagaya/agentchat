import type { Env } from "./env";
import { getDb } from "./db";
import { agentRuntimes, chatAgentRuntimes, sandboxes } from "@agentchat/db";
import { eq } from "drizzle-orm";

type AgentCreateRequest = {
  chat_id?: string;
  agent_id?: string;
  agent?: Record<string, unknown>;
  idempotency_key?: string;
};

type SandboxCreateRequest = {
  chat_id?: string;
  template_id?: string;
  resources?: Record<string, unknown>;
  env_profile?: Record<string, unknown>;
  idempotency_key?: string;
};

type PreviewTokenRequest = {
  sandbox_id?: string;
  user_id?: string;
  org_id?: string;
};

type UsageRequest = {
  chat_id?: string;
  sandbox_id?: string;
  seconds?: number;
  egress_gb?: number;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function badRequest(message: string): Response {
  return json({ ok: false, error: message }, 400);
}

function notFound(message: string): Response {
  return json({ ok: false, error: message }, 404);
}

function serverError(message: string): Response {
  return json({ ok: false, error: message }, 500);
}

async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) {
    throw new Error("missing JSON body");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("invalid JSON body");
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing ${field}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`missing ${field}`);
  }
  return value;
}

function base64Url(buffer: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof buffer === "string") {
    bytes = new TextEncoder().encode(buffer);
  } else if (buffer instanceof Uint8Array) {
    bytes = buffer;
  } else {
    bytes = new Uint8Array(buffer);
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerSegment = base64Url(JSON.stringify(header));
  const payloadSegment = base64Url(JSON.stringify(payload));
  const data = `${headerSegment}.${payloadSegment}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const signatureSegment = base64Url(signature);
  return `${data}.${signatureSegment}`;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ ok: true, service: "orchestrator", env: env.ENVIRONMENT });
  }

  if (request.method === "POST" && url.pathname === "/infra/agents") {
    let body: AgentCreateRequest;
    try {
      body = await readJson<AgentCreateRequest>(request);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid JSON body");
    }

    let chatId: string;
    let agentId: string;
    try {
      chatId = requireString(body.chat_id, "chat_id");
      agentId = requireString(body.agent_id, "agent_id");
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid request");
    }

    const runtimeId = `agent_rt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const db = getDb(env.NEON_DATABASE_URL);

    const existing = await db.query.chatAgentRuntimes.findFirst({
      where: (chatAgentRuntimesTable, { eq: eqFn, and: andFn }) =>
        andFn(eqFn(chatAgentRuntimesTable.chatId, chatId), eqFn(chatAgentRuntimesTable.agentId, agentId))
    });

    if (existing) {
      const runtime = await db.query.agentRuntimes.findFirst({
        where: (agentRuntimesTable, { eq: eqFn }) => eqFn(agentRuntimesTable.runtimeId, existing.runtimeId)
      });
      if (runtime) {
        return json({
          runtime_id: runtime.runtimeId,
          status: runtime.status,
          base_url: runtime.baseUrl
        });
      }
    }

    const baseUrl = env.AGENTS_BASE_URL?.replace(/\/$/, "") ?? "";
    if (!baseUrl) {
      return serverError("AGENTS_BASE_URL is not configured");
    }
    await db.insert(agentRuntimes).values({
      runtimeId,
      chatId,
      agentId,
      status: "ready",
      baseUrl,
      createdAt: now,
      updatedAt: now
    });
    await db.insert(chatAgentRuntimes).values({
      chatId,
      agentId,
      runtimeId,
      createdAt: now
    });

    return json({ runtime_id: runtimeId, status: "ready", base_url: baseUrl });
  }

  if (request.method === "POST" && url.pathname === "/infra/sandboxes") {
    let body: SandboxCreateRequest;
    try {
      body = await readJson<SandboxCreateRequest>(request);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid JSON body");
    }

    let chatId: string;
    try {
      chatId = requireString(body.chat_id, "chat_id");
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid request");
    }

    const sandboxId = `sbx_${crypto.randomUUID()}`;
    const previewHost = `${sandboxId}.preview.agentchat.local`;
    const now = new Date().toISOString();
    const db = getDb(env.NEON_DATABASE_URL);
    await db.insert(sandboxes).values({
      sandboxId,
      chatId,
      status: "starting",
      previewHost,
      templateId: body.template_id,
      sandboxEpoch: 0,
      createdAt: now,
      updatedAt: now
    });

    return json({
      sandbox_id: sandboxId,
      status: "starting",
      preview_host: previewHost,
      sandbox_epoch: 0
    });
  }

  if (request.method === "POST" && url.pathname.startsWith("/infra/sandboxes/") && url.pathname.endsWith("/stop")) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 4 && segments[0] === "infra" && segments[1] === "sandboxes") {
      const sandboxId = segments[2];
      const db = getDb(env.NEON_DATABASE_URL);
      const existing = await db.query.sandboxes.findFirst({
        where: (sandboxesTable, { eq: eqFn }) => eqFn(sandboxesTable.sandboxId, sandboxId)
      });
      if (!existing) {
        return notFound("sandbox not found");
      }
      const now = new Date().toISOString();
      await db
        .update(sandboxes)
        .set({ status: "stopped", sandboxEpoch: (existing.sandboxEpoch ?? 0) + 1, updatedAt: now })
        .where(eq(sandboxes.sandboxId, sandboxId));
      return json({ status: "stopped" });
    }
  }

  if (request.method === "POST" && url.pathname === "/infra/preview-token") {
    let body: PreviewTokenRequest;
    try {
      body = await readJson<PreviewTokenRequest>(request);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid JSON body");
    }

    let sandboxId: string;
    let userId: string;
    let orgId: string;
    try {
      sandboxId = requireString(body.sandbox_id, "sandbox_id");
      userId = requireString(body.user_id, "user_id");
      orgId = requireString(body.org_id, "org_id");
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid request");
    }

    const secret = env.PREVIEW_JWT_SECRET;
    if (!secret) {
      return serverError("preview token secret not configured");
    }

    const db = getDb(env.NEON_DATABASE_URL);
    const record = await db.query.sandboxes.findFirst({
      where: (sandboxesTable, { eq: eqFn }) => eqFn(sandboxesTable.sandboxId, sandboxId)
    });
    if (!record) {
      return notFound("sandbox not found");
    }

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = {
      sub: userId,
      org_id: orgId,
      chat_id: record.chatId,
      sandbox_id: sandboxId,
      sandbox_epoch: record.sandboxEpoch,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt / 1000)
    };
    const token = await signJwt(payload, secret);
    return json({ jwt_token: token, expires_at: new Date(expiresAt).toISOString() });
  }

  if (request.method === "POST" && url.pathname === "/infra/usage") {
    let body: UsageRequest;
    try {
      body = await readJson<UsageRequest>(request);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid JSON body");
    }

    try {
      requireString(body.chat_id, "chat_id");
      requireString(body.sandbox_id, "sandbox_id");
      requireNumber(body.seconds, "seconds");
      requireNumber(body.egress_gb, "egress_gb");
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "invalid request");
    }

    return json({ accepted: true });
  }

  return new Response("Not Found", { status: 404 });
}

export async function handleScheduled(controller: ScheduledController, env: Env): Promise<void> {
  const timestamp = new Date(controller.scheduledTime).toISOString();
  console.log("scheduled", { env: env.ENVIRONMENT, timestamp });
}
