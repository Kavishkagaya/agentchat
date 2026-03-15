import type { AgentRunInput } from "@axon/agent-factory";
import { verifyAgentAccessToken } from "@axon/shared";
import { loadAgentConfig } from "./config";
import type { Env } from "./env";
import { streamAgent } from "./runner";
import { createEventStream } from "./stream";

export type AgentRunRequest = {
  agent_id?: string;
  config_id?: string;
  runtime_id?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  chat_context?: { identity: string; team: string };
};

function structuredError(code: string, message: string) {
  return { code, message };
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

async function executeAndStreamAgent(
  env: Env,
  agentId: string | undefined,
  body: AgentRunRequest,
  configId: string | null,
  send: ReturnType<typeof createEventStream>["send"]
): Promise<void> {
  send("status", { status: "thinking" });

  try {
    const record = await loadAgentConfig(env, agentId, body.runtime_id);
    send("status", { status: "running" });

    const input: AgentRunInput = {
      prompt: body.prompt,
      messages: body.messages,
      chat_context: body.chat_context,
    };

    for await (const event of streamAgent(record, env, input, {
      onToolError: (toolId, error) => {
        send("tool_error", { tool_call_id: toolId, error });
      },
    })) {
      switch (event.type) {
        case "text_delta":
          send("text_delta", { text: event.text });
          break;

        case "reasoning":
          send("reasoning", { text: event.text });
          break;

        case "tool_call":
          send("tool_call", {
            tool_call_id: event.tool_call_id,
            name: event.name,
            args: event.args,
          });
          break;

        case "tool_result":
          send("tool_result", {
            tool_call_id: event.tool_call_id,
            name: event.name,
            result: event.result,
          });
          break;

        case "step_finish":
          send("step_finish", {
            finish_reason: event.finish_reason,
            usage: event.usage,
          });
          break;

        case "error":
          send("error", { code: "stream_error", message: event.error });
          break;

        case "final":
          send("status", { status: "completed" });
          send("final", {
            agent_id: record.agentId,
            config_id: configId,
            runtime_id: body.runtime_id,
            text: event.text,
            finish_reason: event.finish_reason,
            usage: event.usage,
            agent_nickname: record.agentName,
          });
          break;
      }
    }
  } catch (error) {
    send("error", {
      code: "agent_error",
      message: error instanceof Error ? error.message : "agent error",
    });
  }
}

async function executeAgentCoarse(
  env: Env,
  agentId: string | undefined,
  body: AgentRunRequest,
  configId: string | null,
  send: ReturnType<typeof createEventStream>["send"]
): Promise<void> {
  send("status", { status: "thinking" });

  try {
    const record = await loadAgentConfig(env, agentId, body.runtime_id);
    send("status", { status: "running" });

    const input: AgentRunInput = {
      prompt: body.prompt,
      messages: body.messages,
      chat_context: body.chat_context,
    };

    for await (const event of streamAgent(record, env, input, {
      onToolError: (toolId, error) => {
        send("tool_error", { tool_call_id: toolId, error });
      },
    })) {
      switch (event.type) {
        case "text_delta":
        case "reasoning":
          break;

        case "tool_call":
          send("tool_call", {
            tool_call_id: event.tool_call_id,
            name: event.name,
            args: event.args,
          });
          break;

        case "tool_result":
          send("tool_result", {
            tool_call_id: event.tool_call_id,
            name: event.name,
            result: event.result,
          });
          break;

        case "step_finish":
          send("step_finish", {
            finish_reason: event.finish_reason,
            usage: event.usage,
          });
          break;

        case "error":
          send("error", { code: "agent_error", message: event.error });
          break;

        case "final":
          send("status", { status: "completed" });
          send("final", {
            agent_id: record.agentId,
            config_id: configId,
            runtime_id: body.runtime_id,
            text: event.text,
            finish_reason: event.finish_reason,
            usage: event.usage,
            agent_nickname: record.agentName,
          });
          break;
      }
    }
  } catch (error) {
    send("error", {
      code: "agent_error",
      message: error instanceof Error ? error.message : "agent error",
    });
  }
}

// Handlers

export async function handleAgentRun(request: Request, env: Env): Promise<Response> {
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
      await executeAgentCoarse(env, agentId, body, authPayload.config_id, send);
    } finally {
      await close();
    }
  })();

  return response;
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
      await executeAndStreamAgent(env, agentId, body, authPayload.config_id, send);
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

      await executeAgentCoarse(env, agentId, body, null, send);
    } finally {
      await close();
    }
  })();

  return response;
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

      await executeAndStreamAgent(env, agentId, body, null, send);
    } finally {
      await close();
    }
  })();

  return response;
}