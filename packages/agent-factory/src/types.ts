import type { ModelMessage } from "ai";
import type { z, ZodTypeAny } from "zod";

export type AgentToolRef = {
  id: string;
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type AgentConfig = {
  agent_id: string;
  provider: string;
  model: string;
  system_prompt?: string;
  tools?: AgentToolRef[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop?: string[];
  seed?: number;
};

export type AgentChatContext = {
  identity: string;
  team: string;
};

export type AgentRunInput = {
  prompt?: string;
  messages?: ModelMessage[];
  chat_context?: AgentChatContext;
};

import type { ToolLoopAgent } from "ai";

export type AgentRunResult = Awaited<
  ReturnType<InstanceType<typeof ToolLoopAgent>["generate"]>
>;

export type ModelEnv = Record<string, string | undefined>;

export type ModelAdapter = {
  name: string;
  createModel: (modelId: string, env: ModelEnv) => unknown;
};

export type ToolExecutionContext = {
  agent_id: string;
  tool: AgentToolRef;
};

export type ToolImplementation<TSchema extends ZodTypeAny = ZodTypeAny> = {
  id: string;
  description: string;
  schema: TSchema;
  execute: (args: z.infer<TSchema>, context: ToolExecutionContext) => Promise<unknown>;
};

export type ToolRegistry = {
  get: (toolId: string) => ToolImplementation | undefined;
  has: (toolId: string) => boolean;
  list: () => ToolImplementation[];
};

export type AgentFactoryOptions = {
  maxSteps?: number;
  onToolCall?: (toolId: string, args: unknown, toolName?: string) => void;
  onFinish?: () => Promise<void>;
};

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; tool_call_id: string; name: string; args: unknown }
  | { type: "tool_result"; tool_call_id: string; name: string; result: unknown }
  | { type: "step_finish"; finish_reason: string; usage: unknown }
  | { type: "error"; error: string }
  | { type: "final"; text: string; usage: unknown; finish_reason: string };
