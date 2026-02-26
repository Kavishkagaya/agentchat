## 1. Runtime Contract & Auth

- [ ] 1.1 Define request/response schema for worker invocation (agent_id, chat context, tracing fields)
- [ ] 1.2 Implement session certificate verification and request signature validation
- [ ] 1.3 Add structured error codes and response envelope for GC integration

## 2. Resolution Pipeline

- [ ] 2.1 Fetch agent config by agent_id (tools, provider_id, MCP selections, tool masks)
- [ ] 2.2 Fetch provider config and resolve credential secrets via secret-management
- [ ] 2.3 Resolve MCP metadata/tool lists and apply masking + allowlists

## 3. Caching & Invalidation

- [ ] 3.1 Add L1 in-memory cache with TTL for agent/provider/MCP/secrets
- [ ] 3.2 Add L2 shared cache keys using versioned identifiers (agent updated_at, secret version)
- [ ] 3.3 Wire cache invalidation on config/secret updates

## 4. Tool Execution & Policy

- [ ] 4.1 Assemble per-request tool registry (built-ins, HTTP template, MCP tools)
- [ ] 4.2 Enforce HTTP tool approval policy for mutating requests
- [ ] 4.3 Ensure tool execution uses scoped secrets without prompt exposure
- [ ] 4.4 Emit structured tool failure events in response stream

## 5. Streaming & Observability

- [ ] 5.1 Implement request-scoped streaming (tokens + tool events) resilient to worker sleep
- [ ] 5.2 Add metrics/logging for cache hit rate, resolution latency, and tool errors
- [ ] 5.3 Add smoke tests for auth validation, cache behavior, and MCP masking
