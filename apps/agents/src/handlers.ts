import type { AgentRunInput } from "@axon/agent-factory";
import { verifyAgentAccessToken } from "@axon/shared";
import { loadAgentConfig } from "./config";
import type { Env } from "./env";
import { runAgent } from "./runner";
import { createEventStream } from "./stream";

export type AgentRunRequest = {
  agent_id?: string;
  config_id?: string;
  runtime_id?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

type AgentEvent = Record<string, unknown>;
type EventCallback = (event: AgentEvent) => void;

function structuredError(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

async function executeAgent(
  send: EventCallback,
  env: Env,
  agentId: string | undefined,
  body: AgentRunRequest,
  configId: string | null
): Promise<void> {
  send({ type: "status", status: "thinking" });

  try {
    const record = await loadAgentConfig(env, agentId, body.runtime_id);
    send({ type: "status", status: "running" });

    const input: AgentRunInput = {
      prompt: body.prompt,
      messages: body.messages,
    };

    const result = await runAgent(record, env, input, {
      onToolCall: (toolId, args, toolName) => {
        send({
          type: "event",
          eventType: "tool_call",
          tool: toolId,
          name: toolName,
          args,
        });
      },
      onToolError: (toolId, error) => {
        send({
          type: "event",
          eventType: "tool_error",
          tool: toolId,
          error,
        });
      },
    });

    send({ type: "status", status: "completed" });
    send({
      type: "final",
      ok: true,
      agent_id: record.agentId,
      config_id: configId,
      runtime_id: body.runtime_id,
      role: "assistant",
      text: result.text,
      finish_reason: result.finish_reason,
      usage: result.usage,
      agent_nickname: record.agentName,
    });
  } catch (error) {
    send({
      type: "error",
      ok: false,
      error: {
        code: "agent_error",
        message: error instanceof Error ? error.message : "agent error",
      },
    });
  }
}

async function authorizeRequest(
  request: Request,
  env: Env,
  requestedConfigId?: string,
  requestedAgentId?: string
) {
  const header = request.headers.get("authorization");
  if (!header) {
    throw new Error("missing authorization header");
  }
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new Error("invalid authorization header");
  }

  return await verifyAgentAccessToken(env.GC_PUBLIC_KEY, token, {
    config_id: requestedConfigId,
    agent_id: requestedAgentId,
  });
}

async function executeAndCollectEvents(
  env: Env,
  agentId: string | undefined,
  body: AgentRunRequest,
  configId: string | null
): Promise<Response> {
  const events: AgentEvent[] = [];
  const send: EventCallback = (event) => {
    events.push(event);
  };

  try {
    await executeAgent(send, env, agentId, body, configId);
    return Response.json({ events });
  } catch (error) {
    return Response.json(
      structuredError("agent_error", error instanceof Error ? error.message : "agent error"),
      { status: 500 }
    );
  }
}

async function executeAndStreamEvents(
  env: Env,
  agentId: string | undefined,
  body: AgentRunRequest,
  configId: string | null,
  send: ReturnType<typeof createEventStream>["send"]
): Promise<void> {
  const eventCallback: EventCallback = (event) => {
    const eventType = (event.type as string) || "event";
    const { type, ...data } = event;
    send(eventType, data);
  };

  await executeAgent(eventCallback, env, agentId, body, configId);
}

// Handlers

export async function handleAgentRun(request: Request, env: Env): Promise<Response> {
  let body: AgentRunRequest;
  try {
    body = (await request.json()) as AgentRunRequest;
  } catch {
    return Response.json(structuredError("invalid_json", "invalid JSON body"), {
      status: 400,
    });
  }

  let authPayload: Awaited<ReturnType<typeof authorizeRequest>>;
  try {
    authPayload = await authorizeRequest(request, env, body.config_id, body.agent_id);
  } catch (error) {
    return Response.json(
      structuredError("unauthorized", error instanceof Error ? error.message : "authorization failed"),
      { status: 401 }
    );
  }

  const agentId = body.agent_id ?? authPayload.agent_id;
  return executeAndCollectEvents(env, agentId, body, authPayload.config_id);
}

export async function handleAgentRunStream(request: Request, env: Env): Promise<Response> {
  const { stream, send, close } = createEventStream();

  const response = new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });

  (async () => {
    try {
      let body: AgentRunRequest;
      try {
        body = (await request.json()) as AgentRunRequest;
      } catch {
        send("error", structuredError("invalid_json", "invalid JSON body"));
        return;
      }

      let authPayload: Awaited<ReturnType<typeof authorizeRequest>>;
      try {
        authPayload = await authorizeRequest(request, env, body.config_id, body.agent_id);
      } catch (error) {
        send("error", structuredError("unauthorized", error instanceof Error ? error.message : "authorization failed"));
        return;
      }

      const agentId = body.agent_id ?? authPayload.agent_id;
      await executeAndStreamEvents(env, agentId, body, authPayload.config_id, send);
    } finally {
      await close();
    }
  })();

  return response;
}

export async function handleAgentRunDev(request: Request, env: Env): Promise<Response> {
  if (env.ENVIRONMENT === "production") {
    return Response.json(
      structuredError("forbidden", "dev endpoint is not available in production"),
      { status: 403 }
    );
  }

  let body: AgentRunRequest;
  try {
    body = (await request.json()) as AgentRunRequest;
  } catch {
    return Response.json(structuredError("invalid_json", "invalid JSON body"), {
      status: 400,
    });
  }

  const agentId = body.agent_id;
  if (!agentId) {
    return Response.json(
      structuredError("missing_agent_id", "agent_id is required"),
      { status: 400 }
    );
  }

  return executeAndCollectEvents(env, agentId, body, null);
}

export async function handleAgentRunDevStream(request: Request, env: Env): Promise<Response> {
  if (env.ENVIRONMENT === "production") {
    return Response.json(
      structuredError("forbidden", "dev endpoint is not available in production"),
      { status: 403 }
    );
  }

  const { stream, send, close } = createEventStream();

  const response = new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });

  (async () => {
    try {
      let body: AgentRunRequest;
      try {
        body = (await request.json()) as AgentRunRequest;
      } catch {
        send("error", structuredError("invalid_json", "invalid JSON body"));
        return;
      }

      const agentId = body.agent_id;
      if (!agentId) {
        send("error", structuredError("missing_agent_id", "agent_id is required"));
        return;
      }

      await executeAndStreamEvents(env, agentId, body, null, send);
    } finally {
      await close();
    }
  })();

  return response;
}
