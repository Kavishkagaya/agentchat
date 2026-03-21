import type { AgentRunInput } from "@axon/agent-factory";
import { verifyAgentAccessToken } from "@axon/shared";
import { loadAgentConfig } from "./config";
import type { Env } from "./env";
import { streamAgent } from "./runner";
import { createEventStream } from "./stream";
import { createTracer, storeTrace } from "./tracing";

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
  requestedAgentId?: string,
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

/**
 * Execute agent with coarse SSE (tool events and final response only).
 */
async function executeAgent(
  env: Env,
  agentId: string | undefined,
  body: AgentRunRequest,
  configId: string | null,
  send: ReturnType<typeof createEventStream>["send"],
): Promise<void> {
  const tracer = createTracer(agentId ?? "unknown");
  const traceId = tracer.invocationId;

  send("status", { status: "thinking" });
  send("trace", { invocationId: traceId });

  try {
    const configStart = Date.now();
    const record = await loadAgentConfig(env, agentId, body.runtime_id);
    tracer.recordPhase("configLoad", Date.now() - configStart, {
      cacheHit: false, // TODO: expose cache hit from loadAgentConfig
    });
    console.log(`[Agent ${agentId}] Config loaded, tools in config:`, Array.isArray(record.config.tools) ? record.config.tools.map(t => t.id).join(", ") : "none");

    send("status", { status: "running" });

    const input: AgentRunInput = {
      prompt: body.prompt,
      messages: body.messages,
      chat_context: body.chat_context,
    };

    let streamStart = Date.now();
    let streamPhaseRecorded = false;
    const invocations: Array<{ nickname: string }> = [];
    let accumulatedText = "";

    for await (const event of streamAgent(record, env, input, {
      onToolCall: (toolId, args) => {
        if (toolId === "invoke_agent") {
          const a = args as { nickname?: string };
          if (a.nickname) {
            invocations.push({ nickname: a.nickname });
          }
        }
      },
      onToolError: (toolId, error) => {
        send("tool_error", { tool_call_id: toolId, error });
        tracer.recordError("stream", "tool_error", `${toolId}: ${error}`);
      },
    })) {
      // Record phase timing on first event after stream starts
      if (event.type !== "error" && !streamPhaseRecorded) {
        tracer.recordPhase("stream", 0, {
          startLatency: Date.now() - streamStart,
          duration: 0,
          finishReason: "in_progress",
        });
        streamPhaseRecorded = true;
        streamStart = Date.now();
      }

      switch (event.type) {
        case "text_delta":
          accumulatedText += event.text;
          break;

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
          send("error", { code: "stream_error", message: event.error });
          tracer.recordError("stream", "stream_error", event.error);
          break;

        case "final":
          send("status", { status: "completed" });
          send("final", {
            agent_id: record.agentId,
            config_id: configId,
            runtime_id: body.runtime_id,
            text: event.text ?? accumulatedText,
            finish_reason: event.finish_reason,
            usage: event.usage,
            invocations,
          });
          // Update stream phase with final timing
          if (streamPhaseRecorded) {
            tracer.recordPhase("stream", Date.now() - streamStart, {
              startLatency: 0,
              finishReason: event.finish_reason ?? "stop",
            });
          }
          break;
      }
    }

    // Finalize and store trace
    const trace = tracer.finalize();
    storeTrace(trace);
    send("trace_complete", {
      invocationId: traceId,
      totalDuration: trace.endTime - trace.startTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent error";
    send("error", {
      code: "agent_error",
      message,
    });
    tracer.recordError("execute", "agent_error", message);
    const trace = tracer.finalize();
    storeTrace(trace);
    send("trace_complete", {
      invocationId: traceId,
      totalDuration: trace.endTime - trace.startTime,
    });
  }
}

// Handler factory — eliminates boilerplate across 4 endpoint handlers

type HandlerOptions = {
  requireAuth: boolean;
  devOnly?: boolean;
};

function createAgentHandler(options: HandlerOptions) {
  return async (request: Request, env: Env): Promise<Response> => {
    // Dev-only endpoint guard
    if (options.devOnly && env.ENVIRONMENT === "production") {
      return Response.json(
        structuredError(
          "forbidden",
          "dev endpoint is not available in production",
        ),
        { status: 403 },
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

        // Optional authentication
        let authPayload: Awaited<ReturnType<typeof authorizeRequest>> | null =
          null;
        let configId: string | null = null;
        let agentId = body.agent_id;

        if (options.requireAuth) {
          try {
            authPayload = await authorizeRequest(
              request,
              env,
              body.config_id,
              body.agent_id,
            );
            configId = authPayload.config_id;
            agentId = agentId ?? authPayload.agent_id;
          } catch (error) {
            send(
              "error",
              structuredError(
                "unauthorized",
                error instanceof Error ? error.message : "authorization failed",
              ),
            );
            return;
          }
        } else {
          // Dev endpoints require agent_id in body
          if (!agentId) {
            send(
              "error",
              structuredError("missing_agent_id", "agent_id is required"),
            );
            return;
          }
        }

        await executeAgent(env, agentId, body, configId, send);
      } finally {
        await close();
      }
    })();

    return response;
  };
}

// Export the 2 handlers as factory instances
export const handleAgentRun = createAgentHandler({
  requireAuth: true,
});

export const handleAgentRunDev = createAgentHandler({
  requireAuth: false,
  devOnly: true,
});
