# Agents Service

Agent execution service that runs LLM agents with tool support. Receives invocation requests, manages agent configuration/models/secrets, resolves MCP tools, and streams agent outputs back via SSE.

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
      └─ [tools.ts] Build tool registry (default + MCP tools)
  → [agent-factory] Execute LLM agent
  → [stream.ts] SSE response (text_delta, reasoning, tool_call, tool_result, error, final)
```

## Key Files

| File | Role |
|------|------|
| `src/index.ts` | Worker entry point, request routing |
| `src/handlers.ts` | Request handlers for all 4 endpoints, SSE streaming |
| `src/runner.ts` | Agent orchestration: config normalization, model/tool resolution |
| `src/config.ts` | Agent config loading with 2-level caching (in-memory TTL + KV) |
| `src/resolution.ts` | Resolves models, secrets (encrypted), and MCP servers |
| `src/tools.ts` | Tool registry: default tools + MCP tool invocation via HTTP |
| `src/stream.ts` | SSE `TransformStream` encoder for event streaming |
| `src/cache.ts` | In-memory TTL + LRU cache (max 500 entries per kind) |
| `src/cache-store.ts` | L2 cache via Cloudflare KV (versioned keys) |
| `src/telemetry.ts` | In-memory metrics (cache hits, resolution timing, tool errors) |
| `src/env.ts` | Environment type definition and validation |

## Endpoints

| Endpoint | Auth | Mode |
|----------|------|------|
| `POST /agents/run` | JWT | Coarse (final response only) |
| `POST /agents/run-stream` | JWT | Full streaming (all SSE events) |
| `POST /agents/run-dev` | None (dev only) | Coarse |
| `POST /agents/run-dev-stream` | None (dev only) | Full streaming |

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
