# Agents Service

Agent execution service that runs LLM agents with tool support. Receives invocation requests, manages agent configuration/models/secrets, resolves MCP tools, and streams agent outputs back via SSE with execution tracing.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **AI SDK**: Vercel AI SDK via `@axon/agent-factory`
- **Database**: PostgreSQL (Neon serverless) for config; Cloudflare KV for L2 cache
- **Auth**: Ed25519 JWT tokens

## Architecture

```
Client (Orchestrator / Memory Controller)
  → POST /agents/run | /agents/run-stream | /agents/run-dev | /agents/run-dev-stream
  → [handlers.ts] JWT auth via @axon/shared
  → [config.ts] Load agent config (L1 in-memory + L2 KV cache → DB fallback)
  → [runner.ts] Build agent runner
      ├─ [resolution.ts] Resolve model env vars, decrypt secrets, fetch MCP tool defs
      ├─ [runner.ts helpers] resolveSkills(), buildMcpClients()
      └─ [tools.ts] Build tool registry (default + MCP tools)
  → [agent-factory] Execute LLM agent
  → [tracing.ts] Record execution phases + tool calls
  → [stream.ts] SSE response (text_delta, reasoning, tool_call, tool_result, error, final, trace)
```

## Key Files

| File | Role |
|------|------|
| `src/index.ts` | Worker entry point, request routing, metrics/traces endpoints |
| `src/handlers.ts` | 4 endpoint handlers via factory, request auth, tracing integration |
| `src/runner.ts` | Agent orchestration: config normalization, helper functions (resolveSkills, buildMcpClients), model/tool resolution |
| `src/config.ts` | Agent config loading with 2-level caching (in-memory TTL + KV) |
| `src/resolution.ts` | Model/secret/MCP server resolution via generic `createCachedLoader<T>` |
| `src/cache-utils.ts` | Shared `resolveUpdatedAt()` + generic `createCachedLoader<T>` factory |
| `src/tools.ts` | Tool registry: default tools + MCP tool invocation via HTTP |
| `src/tracing.ts` | Per-invocation execution tracing (phase timings, tool execution context) |
| `src/stream.ts` | SSE `TransformStream` encoder for event streaming |
| `src/cache.ts` | In-memory TTL + LRU cache (max 500 entries per kind) |
| `src/cache-store.ts` | L2 cache via Cloudflare KV (versioned keys) |
| `src/telemetry.ts` | In-memory metrics (cache hits, resolution timing, tool errors) |
| `src/env.ts` | Environment type definition and validation |

## Endpoints

| Endpoint | Auth | Mode | Description |
|----------|------|------|---|
| `POST /agents/run` | JWT | Coarse | Final response only (no text_delta/reasoning) |
| `POST /agents/run-stream` | JWT | Full streaming | All SSE events (text_delta, reasoning, traces) |
| `POST /agents/run-dev` | None (dev only) | Coarse | Dev: final response only |
| `POST /agents/run-dev-stream` | None (dev only) | Full streaming | Dev: full events + traces |
| `GET /metrics` | None | Query | Aggregate telemetry (cache hits/misses, resolution timings) |
| `GET /traces` | None | Query | All stored execution traces (up to 100 most recent) |
| `GET /traces/:invocationId` | None | Query | Single trace by invocation ID |

## Handler Factory & Execute Functions

**Handler Factory** (`createAgentHandler`):
- Eliminates 4× boilerplate: SSE headers, IIFE async, body parse, optional auth, env guards
- Takes `{ requireAuth, mode, devOnly? }`
- Returns handler function for `index.ts` routing

**Execute Function** (`executeAgent`):
- Single function with `mode: 'stream' | 'coarse'` parameter
- `stream` mode sends all events (text_delta, reasoning)
- `coarse` mode drops text/reasoning, only sends tool/final events
- Integrates `ExecutionTracer` for per-request phase tracking + trace storage

## Separation of Concerns

### Cache Utilities (`cache-utils.ts`)

Generic `createCachedLoader<T>` factory encapsulates L1/L2/DB pattern:
1. L1 check + `readLatestVersion` staleness guard
2. L2 fallback + L1 write-back
3. DB fetch + write-through
4. Metrics recording

Eliminates 3× copy-pasted ~40-line load functions. Each cached entity type now ~10 lines:
```ts
const loadModelCached = (env) => createCachedLoader({
  cache, cacheKeyPrefix, writeL2, dbFetch, getVersion, cacheKind, env
});
```

### Runner Helpers

**`resolveSkills(rawConfig)`**:
- Fetches skill records from DB by ID array
- Builds system prompt injection string
- Returns `{ skills, systemPromptInjection }`

**`buildMcpClients(env, orgId, serverIds)`**:
- Creates MCP clients sequentially (no Promise.all — tracks successful clients for cleanup)
- Handles partial failure: closes already-opened clients on error
- Merges tool sets from all clients
- Returns `{ toolSets, close: () => Promise<void> }`

Both extracted from `buildAgentRunner`, making it a thin coordinator.

### Handler Factory Pattern

Before: 4 nearly-identical handler functions (200 lines total)
After: 1 factory + 4 one-liners
```ts
export const handleAgentRun = createAgentHandler({ requireAuth: true, mode: 'coarse' });
export const handleAgentRunStream = createAgentHandler({ requireAuth: true, mode: 'stream' });
export const handleAgentRunDev = createAgentHandler({ requireAuth: false, mode: 'coarse', devOnly: true });
export const handleAgentRunDevStream = createAgentHandler({ requireAuth: false, mode: 'stream', devOnly: true });
```

## Execution Tracing

**Per-request span** (`ExecutionTracer`):
- `invocationId` (UUID) — unique per request
- `phases` — timing for: configLoad, modelResolution, mcpSetup, toolRegistry, stream
- `toolExecutions` — array of tool calls (toolId, name, args, duration, result, error)
- `errors` — array of (phase, code, message) tuples
- Start/end timestamps

**Phase Recording**:
```ts
tracer.recordPhase('configLoad', duration, { cacheHit: boolean });
tracer.recordPhase('modelResolution', duration, { modelId, provider });
tracer.recordPhase('mcpSetup', duration, { serverCount, failedServers });
tracer.recordPhase('stream', duration, { startLatency, finishReason });
```

**Tool Execution**:
```ts
tracer.recordToolExecution(toolId, toolName, args, duration, result, error?);
```

**Storage & Retrieval**:
- In-memory store (max 100 recent traces, LRU eviction)
- Accessible via `/traces/:invocationId` or `/traces` endpoints
- Used for post-invocation debugging and agentic observability

## Monorepo Dependencies

- `@axon/agent-factory` — Core agent execution engine (createAgentRunner, normalizeAgentConfig)
- `@axon/shared` — JWT verification (verifyAgentAccessToken)
- `@axon/worker-database` — DB client and schema exports

## Dev

```bash
npm run dev        # wrangler dev on port 8787
npm run deploy     # wrangler deploy
npm run typecheck  # tsc --noEmit
```

## Key Environment Variables

- `DATABASE_URL` — Neon PostgreSQL connection string
- `GC_PUBLIC_KEY` — Ed25519 public key for JWT verification
- `SECRETS_ENCRYPTION_KEY` — Decrypts stored model API keys
- `CLOUDFLARE_AIG_*` — Cloudflare AI Gateway credentials
- `AGENTS_KV` — Optional KV namespace for L2 cache
- `AGENT_CONFIG_CACHE_TTL_SECONDS` — TTL for in-memory config cache (default 5min)
- `ENVIRONMENT` — 'production' or 'development' (gates /dev endpoints)

## Recent Changes (Refactor)

### Phase 1: Separation of Concerns
- ✅ Extracted `cache-utils.ts` with `createCachedLoader<T>` generic (90 LOC → 20 LOC per loader)
- ✅ Refactored `resolution.ts` to use cached loader pattern
- ✅ Merged duplicate `executeAndStreamAgent` + `executeAgentCoarse` into `executeAgent(mode)`
- ✅ Created `createAgentHandler` factory (200 LOC → 4 one-liners)
- ✅ Extracted runner helpers: `resolveSkills()`, `buildMcpClients()`
- ✅ Fixed factory.ts: removed double `onToolCall`, fixed fragile `await result as any`

### Phase 2: Execution Tracing
- ✅ Created `tracing.ts` with `ExecutionTracer` class
- ✅ Per-invocation phase timing + tool execution tracking
- ✅ Trace storage (in-memory LRU, max 100)
- ✅ `/traces` endpoints for debugging

All changes maintain backward compatibility — SSE event format and streaming behavior unchanged.
