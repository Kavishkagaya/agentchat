## Context

The Agents Worker is a shared, stateless service that executes agent reasoning and tools. The Group Controller provides chat context plus `agent_id` per request. Agent configs, provider catalog entries, MCP server/tool metadata, and secrets already exist in the system, but there is no unified runtime contract that defines how the worker resolves them, enforces tool policies, and returns results. The worker may sleep between requests, while in-flight streaming keeps both the Group Controller and Worker active until completion; persistent Worker↔GC connections are not assumed.

## Goals / Non-Goals

**Goals:**
- Define the runtime request contract and validation rules for the Agents Worker (inputs, auth expectations, response/streaming shape).
- Specify how agent config, provider config, MCP tools, and secrets are resolved and cached for fast access.
- Ensure runtime tool resolution enforces MCP tool masking and per-agent tool allowlists.
- Establish error handling, logging, and observability expectations needed by the Group Controller.

**Non-Goals:**
- Defining the UI/API flows for agent creation, provider catalog management, or secret CRUD.
- Implementing persistent WebSocket channels between Group Controller and the worker (future optimization).
- Changing existing schemas for agents, provider catalog, or secrets beyond what the runtime needs to read.

## Decisions

- **Request-scoped agent instantiation**
  - The worker instantiates the agent on each request using `agent_id` and chat context from the Group Controller.
  - Rationale: The worker is stateless and can sleep; relying on persistent in-worker sessions is fragile.

- **Two-layer caching for runtime resolution**
  - L1 in-memory cache per worker instance (short TTL) for agent config, provider config, MCP tool lists, and secret values.
  - L2 shared cache (KV or equivalent) keyed by stable identifiers and version fields (e.g., `secret_id:version`, `agent_id:updated_at`) with active invalidation on writes.
  - Rationale: L1 avoids hot-path latency; L2 reduces DB/service fetches and aligns with existing cache invalidation strategy.

- **Explicit resolution pipeline**
  - Validate request signature (Group Controller session certificate) and parse inputs.
  - Resolve agent config by `agent_id` (includes tool allowlist, provider_id, MCP selections, tool masks).
  - Resolve provider config by `provider_id` and then resolve provider credential secret via secret-management.
  - Resolve MCP tool definitions from cached MCP metadata; apply tool masking and per-agent allowlists.
  - Assemble prompt context and execute via the base agent template (Vercel AI SDK).
  - Rationale: Makes credential handling and tool exposure explicit and auditable.

- **Tool execution policy enforcement in worker**
  - Built-in tools and HTTP tool template are registered in the worker; MCP tools are mounted dynamically based on validated MCP metadata.
  - Mutating external HTTP calls require approval unless explicitly configured to auto-approve.
  - Rationale: Keeps enforcement centralized and prevents secret leakage into model context.

- **Streaming via request-scoped channel**
  - Use per-request streaming (HTTP chunked/SSE) for responses and tool logs rather than a persistent worker-initiated WebSocket.
  - Rationale: Worker may sleep between requests, but in-flight streams keep both sides active; request-scoped streaming avoids a persistent connection that would prevent sleep.

## Risks / Trade-offs

- **[Cold start latency]** Worker sleep/wake can add latency on low traffic → Mitigation: cache warming on first request, lightweight L1 cache, and minimal per-request initialization.
- **[Stale cache entries]** Inconsistent config or secret versions → Mitigation: versioned cache keys plus short TTL and active invalidation on writes.
- **[Tool mismatch]** MCP tool list changes without updated masks → Mitigation: validate MCP tool lists on updates and re-fetch on version change.
- **[Streaming reliability]** Per-request streams may be interrupted → Mitigation: Group Controller retries and replays with idempotency keys.

## Migration Plan

1. Define worker request/response contract and validation (including auth signatures and required fields).
2. Implement resolution pipeline (agent config → provider config → secret resolution → tools).
3. Add caching layers (L1 + L2) with versioned keys and invalidation wiring.
4. Enforce MCP tool masking and per-agent tool allowlists during tool registry assembly.
5. Implement streaming response behavior and error surfaces expected by the Group Controller.
6. Add metrics/logging for resolution latency, cache hit rate, and tool execution failures.

## Open Questions

- What is the canonical source of MCP tool masking rules in the agent config, and how are updates versioned?
- Do we require an explicit `runtime_id` in requests for idempotency and tracing across retries?
- Should the worker expose a minimal health/ready endpoint for the Orchestrator to prewarm caches?
- What is the expected SLA for secret resolution calls, and do we need a fallback policy when it times out?
