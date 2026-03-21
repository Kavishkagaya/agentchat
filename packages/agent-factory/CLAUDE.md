# Agent Factory

Core agent execution engine. Builds and runs LLM agents with tool support via the Vercel AI SDK. Handles model provider selection, tool merging (registry + MCP), message normalization, and streaming.

## Tech Stack

- **AI SDK**: Vercel AI SDK (`ai`)
- **Providers**: `@ai-sdk/openai`, Cloudflare AI Gateway, `@ai-sdk/mcp` (for MCP tools)
- **Validation**: Zod

## Key Files

| Path | Role |
|------|------|
| `src/factory.ts` | `createAgentRunner` — main entry point for agent execution |
| `src/normalize.ts` | `normalizeAgentConfig` — config normalization (camelCase/snake_case) |
| `src/types.ts` | Agent config and runner type definitions |
| `src/models/registry.ts` | Model provider registry (openai, cloudflare_ai_gateway) |
| `src/models/openai.ts` | OpenAI model provider adapter |
| `src/models/cloudflare-ai-gateway.ts` | Cloudflare AI Gateway provider adapter |
| `src/tools/registry.ts` | Tool registry (Map-based) |
| `src/tools/provider.ts` | ToolProvider interface |
| `src/tools/sandbox.ts` | Built-in sandbox tool implementations |
| `src/skills/loader.ts` | Skill loader tool |

## Core API

### `createAgentRunner(params: AgentRunnerParams)`

Main factory function. Returns a runner object with two methods:

```ts
export function createAgentRunner(params: {
  config: AgentConfig;
  env: ModelEnv;
  toolRegistry: ToolRegistry;
  mcpToolSets?: ToolSet[];
  modelRegistry?: ModelRegistry;
  options?: AgentFactoryOptions;
}): {
  run(input: AgentRunInput): Promise<AgentRunResult>;
  runStream(input: AgentRunInput): AsyncGenerator<AgentStreamEvent>;
}
```

**Params**:
- `config` — normalized agent config (provider, model, system_prompt, tools, temperature, etc.)
- `env` — model environment variables (API keys, tokens, etc.)
- `toolRegistry` — tool implementations (sandbox tools, skill tools)
- `mcpToolSets` — pre-built tool sets from MCP clients
- `modelRegistry` — model provider registry (default: new ModelRegistry())
- `options` — execution options (maxSteps, onToolCall, onFinish)

### `run(input: AgentRunInput): Promise<AgentRunResult>`

Non-streaming execution:
1. Resolves and validates messages
2. Creates `ToolLoopAgent` with tools
3. Calls `agent.generate({ messages })`
4. Returns final result (text, finishReason, usage)

### `runStream(input: AgentRunInput): AsyncGenerator<AgentStreamEvent>`

Streaming execution:
1. Resolves and validates messages
2. Calls `streamText()` from Vercel AI SDK
3. Maps SDK part types to `AgentStreamEvent` discriminated union
4. Yields events as they arrive: text_delta, reasoning, tool_call, tool_result, step_finish, error, final

**Events**:
- `text_delta` — incremental text from LLM
- `reasoning` — internal reasoning (OpenAI o1-style)
- `tool_call` — tool invocation (toolId, args)
- `tool_result` — tool result (toolId, result)
- `step_finish` — end of agent loop (finish_reason, usage)
- `error` — stream error
- `final` — final result after stream completes (text, usage, finish_reason)

## Tool Resolution

**`resolveTools` (internal)**:

Merges tools from two sources:
1. **MCP tools** — pre-built by `@ai-sdk/mcp`, passed via `mcpToolSets`
2. **Registry tools** — built from `ToolRegistry` + `toolRefs` in config

Process:
- Creates Vercel AI SDK `tool()` wrapper around each registry implementation
- Registry tools win on name collision (console warns)
- Unregistered tools get placeholder implementation (returns error)
- Calls `options.onToolCall(toolId, args, toolName)` inside tool execute wrapper

## Message & Config Processing

**`resolveMessages` (internal)**:
- Handles `prompt` (creates user message) or `messages` array
- Ensures last message is from user (appends generic user prompt if needed)
- Coerces to Vercel AI SDK `ModelMessage[]` format

**`buildSystemPrompt` (internal)**:
- Combines chat context (identity, team) + agent system prompt
- Filters out falsy values
- Returns unified system prompt

**`normalizeAgentConfig` (external)**:
- Normalizes field names (camelCase ↔ snake_case)
- Fills defaults (model, provider, temperature, etc.)
- Validates required fields

## Model Providers

### Provider Registry

```ts
class ModelRegistry {
  get(provider: string): ModelAdapter | undefined;
}
```

Built-in adapters:
- `openai` — OpenAI API (models: gpt-4o, gpt-4-turbo, etc.)
- `cloudflare_ai_gateway` — Cloudflare AI Gateway (proxies to multiple providers)

Each adapter has `createModel(modelId, env): LanguageModel` method that returns Vercel AI SDK `LanguageModel`.

### Environment Variables by Provider

**OpenAI**:
```
OPENAI_API_KEY=sk-...
```

**Cloudflare AI Gateway**:
```
CLOUDFLARE_AIG_TOKEN=...
CLOUDFLARE_AIG_ACCOUNT_ID=...
CLOUDFLARE_AIG_GATEWAY_ID=...
CLOUDFLARE_PROVIDER_KEY=... (provider-specific key, e.g. OpenAI key)
CLOUDFLARE_PROVIDER_KIND=... (provider type: openai, anthropic, etc.)
```

## Tool Registry

**`ToolRegistry` interface**:
```ts
{
  get(toolId: string): ToolImplementation | undefined;
  has(toolId: string): boolean;
  list(): ToolImplementation[];
}
```

**`ToolImplementation<TSchema>`**:
```ts
{
  id: string;
  description: string;
  schema: TSchema; // Zod schema
  execute(args: z.infer<TSchema>, context: ToolExecutionContext): Promise<unknown>;
}
```

**`ToolExecutionContext`**:
```ts
{
  agent_id: string;
  tool: AgentToolRef;
}
```

Registry tools are wrapped with Vercel AI SDK `tool()` function, adding schema validation and integration with agent loop.

## Types

| Type | Purpose |
|------|---------|
| `AgentConfig` | Agent configuration (model, system_prompt, tools, params) |
| `AgentRunInput` | Execution input (prompt or messages, chat_context) |
| `AgentRunResult` | Non-streaming result (text, finishReason, usage) |
| `AgentStreamEvent` | Streaming event (discriminated union of 7 types) |
| `ModelEnv` | Model environment variables (Record<string, string \| undefined>) |
| `ToolRegistry` | Tool registry interface |
| `ToolImplementation<TSchema>` | Single tool implementation |
| `ToolExecutionContext` | Context passed to tool execute function |
| `AgentFactoryOptions` | Execution options (maxSteps, onToolCall, onFinish) |

## Consumed By

- `apps/agents` — imports `createAgentRunner`, `normalizeAgentConfig`, types
- Any service needing agent execution with tool support

## Recent Changes (Refactor)

### Bug Fixes
- ✅ Removed double `onToolCall` in streaming path (was called in tool execute + for-await loop)
- ✅ Fixed fragile `(await result) as any` — now uses promise properties directly
- ✅ Removed unused `toolNameToId` variable

All changes maintain backward compatibility — streaming behavior and event format unchanged.
