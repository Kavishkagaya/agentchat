import type { AgentRunInput } from "@axon/agent-factory";
import { verifyAgentAccessToken } from "@axon/shared";
import { loadAgentConfig } from "./config";
import type { Env } from "./env";
import { runAgent } from "./runner";
import { createEventStream } from "./stream";

export type AgentRunRequest = {
  agent_id?: string;
  runtime_id?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

function structuredError(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

async function authorizeRequest(
  request: Request,
  env: Env,
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

  const expectedGroupId = request.headers.get("x-group-id") ?? undefined;
  return await verifyAgentAccessToken(env.GC_PUBLIC_KEY, token, {
    group_id: expectedGroupId,
    agent_id: requestedAgentId,
  });
}

export async function handleAgentRun(
  request: Request,
  env: Env
): Promise<Response> {
  let body: AgentRunRequest;
  try {
    body = (await request.json()) as AgentRunRequest;
  } catch {
    return Response.json(
      structuredError("invalid_json", "invalid JSON body"),
      { status: 400 }
    );
  }

  let authPayload: Awaited<ReturnType<typeof authorizeRequest>>;
  try {
    authPayload = await authorizeRequest(request, env, body.agent_id);
  } catch (error) {
    return Response.json(
      structuredError(
        "unauthorized",
        error instanceof Error ? error.message : "authorization failed"
      ),
      { status: 401 }
    );
  }

  const agentId = body.agent_id ?? authPayload.agent_id;
  const events: Array<Record<string, unknown>> = [];
  events.push({ type: "status", status: "thinking" });

  const record = await loadAgentConfig(env, agentId, body.runtime_id);
  events.push({ type: "status", status: "running" });

  const input: AgentRunInput = { prompt: body.prompt, messages: body.messages };
  const result = await runAgent(
    record,
    env,
    input,
    {
      onToolCall: (toolId, args, toolName) => {
        events.push({ type: "tool_call", tool: toolId, name: toolName, args });
      },
    }
  );
  events.push({ type: "status", status: "completed" });

  return new Response(
    JSON.stringify({
      ok: true,
      agent_id: record.agentId,
      group_id: authPayload.group_id,
      runtime_id: body.runtime_id,
      role: "assistant",
      text: result.text,
      finish_reason: result.finish_reason,
      usage: result.usage,
      events,
    }),
    { headers: { "content-type": "application/json" } }
  );
}

export async function handleAgentRunStream(
  request: Request,
  env: Env
): Promise<Response> {
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
    let body: AgentRunRequest;
    try {
      body = (await request.json()) as AgentRunRequest;
    } catch {
      send("error", structuredError("invalid_json", "invalid JSON body"));
      await close();
      return;
    }

    let authPayload: Awaited<ReturnType<typeof authorizeRequest>>;
    try {
      authPayload = await authorizeRequest(request, env, body.agent_id);
    } catch (error) {
      send(
        "error",
        structuredError(
          "unauthorized",
          error instanceof Error ? error.message : "authorization failed"
        )
      );
      await close();
      return;
    }

    const agentId = body.agent_id ?? authPayload.agent_id;
    send("status", { status: "thinking" });

    try {
      const record = await loadAgentConfig(env, agentId, body.runtime_id);
      send("status", { status: "running" });
      const input: AgentRunInput = {
        prompt: body.prompt,
        messages: body.messages,
      };
      const result = await runAgent(
        record,
        env,
        input,
        {
          onToolCall: (toolId, args, toolName) => {
            send("event", {
              type: "tool_call",
              tool: toolId,
              name: toolName,
              args,
            });
          },
        }
      );
      send("status", { status: "completed" });
      send("final", {
        ok: true,
        agent_id: record.agentId,
        group_id: authPayload.group_id,
        runtime_id: body.runtime_id,
        role: "assistant",
        text: result.text,
        finish_reason: result.finish_reason,
        usage: result.usage,
      });
    } catch (error) {
      send(
        "error",
        structuredError(
          "agent_error",
          error instanceof Error ? error.message : "agent error"
        )
      );
    } finally {
      await close();
    }
  })();

  return response;
}
