## Why

The architecture and specs define agent configs, provider catalog, and secrets, but there is no concrete runtime contract that ties them together in the shared Agents Worker. We need a clear runtime specification now to safely execute agents with correct credential resolution, tool policy enforcement, and predictable request/response behavior.

## What Changes

- Define the Agents Worker runtime contract: request payloads (chat context + `agent_id` from the Group Controller), validation, auth expectations, and response/streaming shape.
- Specify how the worker resolves agent config, provider config, MCP/tool definitions, and secrets at invocation time, with cache semantics (TTL + invalidation) for fast access.
- Ensure runtime initialization applies MCP tool masking rules from existing MCP specs when resolving available tools.
- Formalize tool execution rules in the worker (built-in + configurable HTTP + MCP tools), including approval gates and secret scoping.
- Document runtime error handling, logging, and observability hooks needed by the Group Controller. (WebSocket configuration is a later integration step.)

## Capabilities

### New Capabilities
- `agent-worker-runtime`: Specify the shared Agents Worker runtime behavior, including request inputs (chat context + `agent_id`), config/provider/MCP resolution, credential lookup, prompt assembly boundaries, cache semantics, and response/streaming guarantees.
- `agent-worker-tools`: Specify tool resolution and execution in the worker (built-ins, HTTP tool template, MCP tools), including policy/approval flow and safe secret handling.

### Modified Capabilities
- <none>

## Impact

- Affects Agents Worker implementation and its request/response contract with the Group Controller (chat context + `agent_id`).
- Depends on provider-catalog and secret-management services for credential resolution, plus MCP/tool catalogs for execution.
- Runtime init must enforce MCP tool masking and handle worker sleep/wake behavior that may cause frequent WebSocket reconnects at low request rates.
- Impacts tool registry and MCP tool selection paths used during agent creation and invocation.
