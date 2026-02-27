import type { AgentRunInput } from "@axon/agent-factory";
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

export async function handleAgentRun(
  request: Request,
  env: Env
): Promise<Response> {
  const body = (await request.json()) as AgentRunRequest;
  const events: Array<Record<string, unknown>> = [];
  events.push({ type: "status", status: "thinking" });

  const record = await loadAgentConfig(env, body.agent_id, body.runtime_id);
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
      send("error", { ok: false, error: "invalid JSON body" });
      await close();
      return;
    }

    send("status", { status: "thinking" });

    try {
      const record = await loadAgentConfig(env, body.agent_id, body.runtime_id);
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
        runtime_id: body.runtime_id,
        role: "assistant",
        text: result.text,
        finish_reason: result.finish_reason,
        usage: result.usage,
      });
    } catch (error) {
      send("error", {
        ok: false,
        error: error instanceof Error ? error.message : "agent error",
      });
    } finally {
      await close();
    }
  })();

  return response;
}
