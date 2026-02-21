import { generateText, tool } from "ai";
import { z } from "zod";
import type {
  AgentConfig,
  AgentFactoryOptions,
  AgentRunInput,
  AgentRunResult,
  ProviderEnv,
  ToolRegistry
} from "./types";
import { ProviderRegistry } from "./providers/registry";

function resolveTools(agentId: string, tools: AgentConfig["tools"], registry: ToolRegistry, options?: AgentFactoryOptions) {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.reduce<Record<string, ReturnType<typeof tool>>>((acc, toolRef) => {
    const implementation = registry.get(toolRef.id);
    const preferredName = toolRef.name ?? toolRef.id;
    const toolName = acc[preferredName] ? toolRef.id : preferredName;
    if (!implementation) {
      acc[toolName] = tool({
        description: toolRef.description ?? "Unregistered tool",
        parameters: z.record(z.any()),
        execute: async (args) => ({
          ok: false,
          error: "tool not registered",
          tool: toolRef.id,
          args
        })
      });
      return acc;
    }

    acc[toolName] = tool({
      description: toolRef.description ?? implementation.description ?? "",
      parameters: implementation.schema ?? z.record(z.any()),
      execute: async (args) => {
        options?.onToolCall?.(toolRef.id, args, toolName);
        return implementation.execute(args, { agent_id: agentId, tool: toolRef });
      }
    });
    return acc;
  }, {});
}

export function createAgentRunner(params: {
  config: AgentConfig;
  env: ProviderEnv;
  toolRegistry: ToolRegistry;
  providerRegistry?: ProviderRegistry;
  options?: AgentFactoryOptions;
}) {
  const providerRegistry = params.providerRegistry ?? new ProviderRegistry();
  const adapter = providerRegistry.get(params.config.provider);
  if (!adapter) {
    throw new Error(`unsupported provider: ${params.config.provider}`);
  }

  const model = adapter.createModel(params.config.model, params.env);
  const tools = resolveTools(params.config.agent_id, params.config.tools, params.toolRegistry, params.options);

  return {
    async run(input: AgentRunInput): Promise<AgentRunResult> {
      const options: Parameters<typeof generateText>[0] = {
        model,
        system: params.config.system_prompt,
        tools
      };

      if (input.messages && input.messages.length > 0) {
        options.messages = input.messages;
      } else if (input.prompt) {
        options.prompt = input.prompt;
      } else {
        throw new Error("missing prompt or messages");
      }

      if (params.config.temperature !== undefined) {
        (options as Record<string, unknown>).temperature = params.config.temperature;
      }
      if (params.config.max_tokens !== undefined) {
        (options as Record<string, unknown>).maxTokens = params.config.max_tokens;
      }
      if (params.config.top_p !== undefined) {
        (options as Record<string, unknown>).topP = params.config.top_p;
      }
      if (params.config.presence_penalty !== undefined) {
        (options as Record<string, unknown>).presencePenalty = params.config.presence_penalty;
      }
      if (params.config.frequency_penalty !== undefined) {
        (options as Record<string, unknown>).frequencyPenalty = params.config.frequency_penalty;
      }
      if (params.config.stop !== undefined) {
        (options as Record<string, unknown>).stopSequences = params.config.stop;
      }
      if (params.config.seed !== undefined) {
        (options as Record<string, unknown>).seed = params.config.seed;
      }

      const result = await generateText(options);
      return {
        text: result.text,
        finish_reason: result.finishReason,
        usage: result.usage
      };
    }
  };
}
