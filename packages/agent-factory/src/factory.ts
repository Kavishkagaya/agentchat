import { generateText, type LanguageModel, type ToolSet, tool } from "ai";
import { z } from "zod";
import { ModelRegistry } from "./models/registry";
import type {
  AgentConfig,
  AgentFactoryOptions,
  AgentRunInput,
  AgentRunResult,
  ModelEnv,
  ToolRegistry,
} from "./types";

function resolveTools(
  agentId: string,
  tools: AgentConfig["tools"],
  registry: ToolRegistry,
  options?: AgentFactoryOptions
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
        options?.onToolCall?.(toolRef.id, args, toolName);
        return implementation.execute(args, {
          agent_id: agentId,
          tool: toolRef,
        });
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
    params.env
  ) as LanguageModel;
  const tools = resolveTools(
    params.config.agent_id,
    params.config.tools,
    params.toolRegistry,
    params.options
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

      const options: any = {
        model,
        system: params.config.system_prompt,
        tools,
        messages,
      };

      if (params.config.temperature !== undefined) {
        options.temperature = params.config.temperature;
      }
      if (params.config.max_tokens !== undefined) {
        options.maxTokens = params.config.max_tokens;
      }
      if (params.config.top_p !== undefined) {
        options.topP = params.config.top_p;
      }
      if (params.config.presence_penalty !== undefined) {
        options.presencePenalty = params.config.presence_penalty;
      }
      if (params.config.frequency_penalty !== undefined) {
        options.frequencyPenalty = params.config.frequency_penalty;
      }
      if (params.config.stop !== undefined) {
        options.stopSequences = params.config.stop;
      }
      if (params.config.seed !== undefined) {
        options.seed = params.config.seed;
      }

      const result = await generateText(options);
      return {
        text: result.text,
        finish_reason: result.finishReason,
        usage: result.usage,
      };
    },
  };
}
