## Purpose
Define agents worker execution behavior for auth, config resolution, model resolution, and streaming response contracts.

## Requirements

### Requirement: Worker validates GC-signed authorization
The agents worker MUST verify authorization token signature and claims for non-dev execution routes.

#### Scenario: Invalid auth token
- **WHEN** request has missing or invalid bearer token
- **THEN** worker emits structured unauthorized error

### Requirement: Worker validates JSON payload format
The worker MUST return structured `invalid_json` errors for malformed JSON payloads.

#### Scenario: Malformed payload
- **WHEN** request body cannot be parsed as JSON
- **THEN** worker emits `invalid_json` error event

### Requirement: Worker resolves agent config by agent id or runtime id
The worker MUST resolve effective agent configuration using provided `agent_id` or mapped runtime id.

#### Scenario: Resolve via runtime id
- **WHEN** request includes runtime id
- **THEN** worker resolves target agent config before execution

### Requirement: Worker resolves model credentials server-side
The worker MUST resolve model records and secret values server-side to build model environment for execution.

#### Scenario: Resolve model env
- **WHEN** executing an agent bound to a model entry
- **THEN** worker loads model config and credential secret internally

### Requirement: Worker uses version-aware caching for resolution
The worker MUST use cache entries with version checks for agent/model/secret/MCP resolution.

#### Scenario: Use valid cached configuration
- **WHEN** cached version matches latest known version
- **THEN** worker serves from cache

### Requirement: Worker streams structured lifecycle events
The worker MUST stream structured events for status, tool activity, step completion, errors, and final output.

#### Scenario: Stream completed run
- **WHEN** execution finishes
- **THEN** worker emits final event containing text and usage metadata

### Requirement: Dev endpoints are disabled in production
The worker MUST reject dev execution routes when environment is production.

#### Scenario: Call dev route in production
- **WHEN** production runtime receives `/agents/dev/*` call
- **THEN** worker returns forbidden response
