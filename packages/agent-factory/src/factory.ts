import {
  type LanguageModel,
  streamText,
  ToolLoopAgent,
  type ToolSet,
  tool,
} from "ai";
import { z } from "zod";
import { ModelRegistry } from "./models/registry";
import type {
  AgentConfig,
  AgentFactoryOptions,
  AgentRunInput,
  AgentRunResult,
  AgentStreamEvent,
  ModelEnv,
  ToolRegistry,
} from "./types";

function resolveTools(
  agentId: string,
  tools: AgentConfig["tools"],
  registry: ToolRegistry,
  options?: AgentFactoryOptions,
): ToolSet | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.reduce<ToolSet>((acc, toolRef) => {
    const implementation = registry.get(toolRef.id);
    const preferredName = toolRef.name ?? toolRef.id;
    const toolName = acc[preferredName] ? toolRef.id : preferredName;
    if (!implementation) {
      acc[toolName] = tool({
        description: toolRef.description ?? "Unregistered tool",
        inputSchema: z.record(z.string(), z.any()),
        execute: async (args) => ({
          ok: false,
          error: "tool not registered",
          tool: toolRef.id,
          args,
        }),
      });
      return acc;
    }

    acc[toolName] = tool({
      description: toolRef.description ?? implementation.description ?? "",
      inputSchema: implementation.schema ?? z.record(z.string(), z.any()),
      execute: async (args) => {
        console.log(`[Tool Execute] ${toolName} called with:`, args);
        options?.onToolCall?.(toolRef.id, args, toolName);
        const result = await implementation.execute(args, {
          agent_id: agentId,
          tool: toolRef,
        });
        console.log(`[Tool Execute] ${toolName} returned:`, result);
        return result;
      },
    });
    return acc;
  }, {});
}

export function createAgentRunner(params: {
  config: AgentConfig;
  env: ModelEnv;
  toolRegistry: ToolRegistry;
  modelRegistry?: ModelRegistry;
  options?: AgentFactoryOptions;
}) {
  const modelRegistry = params.modelRegistry ?? new ModelRegistry();
  const adapter = modelRegistry.get(params.config.provider);
  if (!adapter) {
    throw new Error(`unsupported provider: ${params.config.provider}`);
  }

  const model = adapter.createModel(
    params.config.model,
    params.env,
  ) as LanguageModel;
  const tools = resolveTools(
    params.config.agent_id,
    params.config.tools,
    params.toolRegistry,
    params.options,
  );

  return {
    async run(input: AgentRunInput): Promise<AgentRunResult> {
      const messages = [...(input.messages ?? [])];
      if (messages.length === 0 && input.prompt) {
        messages.push({
          role: "user",
          content: [{ type: "text", text: input.prompt }],
        });
      }

      if (messages.length === 0) {
        throw new Error("missing prompt or messages");
      }

      const agentSettings = {
        model,
        instructions: params.config.system_prompt,
        tools,
        temperature: params.config.temperature,
        maxTokens: params.config.max_tokens,
        topP: params.config.top_p,
        presencePenalty: params.config.presence_penalty,
        frequencyPenalty: params.config.frequency_penalty,
        stopSequences: params.config.stop,
        seed: params.config.seed,
      };

      const agent = new ToolLoopAgent(agentSettings);
      const result = await agent.generate({
        messages,
      });

      return result;
    },

    async *runStream(input: AgentRunInput): AsyncGenerator<AgentStreamEvent> {
      const messages = [...(input.messages ?? [])];
      if (messages.length === 0 && input.prompt) {
        messages.push({
          role: "user",
          content: [{ type: "text", text: input.prompt }],
        });
      }

      if (messages.length === 0) {
        throw new Error("missing prompt or messages");
      }

      const result = streamText({
        model,
        system: params.config.system_prompt,
        messages,
        tools,
        temperature: params.config.temperature,
        maxTokens: params.config.max_tokens,
        topP: params.config.top_p,
        presencePenalty: params.config.presence_penalty,
        frequencyPenalty: params.config.frequency_penalty,
        stopSequences: params.config.stop,
        seed: params.config.seed,
        maxSteps: params.options?.maxSteps ?? 10,
      } as any);

      for await (const part of result.fullStream) {
        const p = part as any;
        switch (p.type) {
          case "text-delta":
            yield { type: "text_delta", text: p.textDelta || p.text || "" };
            break;
          case "reasoning":
            yield { type: "reasoning", text: p.textDelta || p.text || "" };
            break;
          case "tool-call":
            params.options?.onToolCall?.(
              p.toolCallId,
              p.args || p.input,
              p.toolName,
            );
            yield {
              type: "tool_call",
              tool_call_id: p.toolCallId,
              name: p.toolName,
              args: p.args || p.input,
            };
            break;
          case "tool-result":
            yield {
              type: "tool_result",
              tool_call_id: p.toolCallId,
              name: p.toolName,
              result: p.result,
            };
            break;
          case "error":
            yield { type: "error", error: String(p.error) };
            break;
          case "step-finish":
            yield {
              type: "step_finish",
              finish_reason: p.finishReason,
              usage: p.usage,
            };
            break;
        }
      }

      const finalResult = (await result) as any;
      yield {
        type: "final",
        text: (await finalResult.text) ?? "",
        usage: (await finalResult.usage) ?? undefined,
        finish_reason: (await finalResult.finishReason) ?? "stop",
      };
    },
  };
}
