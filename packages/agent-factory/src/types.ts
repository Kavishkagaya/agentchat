import type { CoreMessage } from "ai";
import type { ZodTypeAny } from "zod";

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

export type AgentRunInput = {
  prompt?: string;
  messages?: CoreMessage[];
};

export type AgentRunResult = {
  text: string;
  finish_reason?: string;
  usage?: unknown;
};

export type ProviderEnv = Record<string, string | undefined>;

export type ProviderAdapter = {
  name: string;
  createModel: (modelId: string, env: ProviderEnv) => unknown;
};

export type ToolExecutionContext = {
  agent_id: string;
  tool: AgentToolRef;
};

export type ToolImplementation = {
  id: string;
  description?: string;
  schema?: ZodTypeAny;
  execute: (args: unknown, context: ToolExecutionContext) => Promise<unknown>;
};

export type ToolRegistry = {
  get: (toolId: string) => ToolImplementation | undefined;
};

export type AgentFactoryOptions = {
  onToolCall?: (toolId: string, args: unknown, toolName?: string) => void;
};
