## ADDED Requirements

### Requirement: Worker accepts request-scoped agent invocation
The Agents Worker MUST accept invocation requests containing `agent_id` and chat context from the Group Controller.

#### Scenario: Invoke agent with chat context
- **WHEN** the Group Controller sends a request with `agent_id` and chat context
- **THEN** the worker validates the payload and proceeds with agent resolution

### Requirement: Worker validates request authenticity
The Agents Worker MUST verify the Group Controller request signature using the session certificate before processing.

#### Scenario: Reject invalid signature
- **WHEN** a request arrives with an invalid or missing signature
- **THEN** the worker rejects the request with an authentication error

### Requirement: Runtime resolves agent configuration by id
The Agents Worker MUST resolve the agent configuration by `agent_id` at invocation time.

#### Scenario: Resolve agent config on request
- **WHEN** a valid request is received
- **THEN** the worker loads the agent configuration for `agent_id` before execution

### Requirement: Runtime resolves provider configuration and credentials
The Agents Worker MUST resolve provider configuration using `provider_id` and fetch provider credentials via secret management.

#### Scenario: Resolve provider credentials
- **WHEN** an agent invocation includes a `provider_id`
- **THEN** the worker fetches provider config and resolves its credential secret server-side

### Requirement: Secrets are excluded from model context
The Agents Worker MUST NOT include provider credentials or secret values in the model prompt context.

#### Scenario: Build prompt without secrets
- **WHEN** the worker assembles prompt context for the model
- **THEN** no secret values are present in the prompt

### Requirement: Cached resolution for low-latency access
The Agents Worker MUST cache resolved agent configs, provider configs, MCP metadata, and secret values with TTL and version-based invalidation.

#### Scenario: Use cached resolution
- **WHEN** the worker receives a request for an agent with a valid cache entry
- **THEN** it uses the cached data instead of fetching from the source

### Requirement: Apply MCP tool masking during initialization
The Agents Worker MUST apply MCP tool masking rules when resolving the set of tools available to an agent.

#### Scenario: Masked MCP tool is excluded
- **WHEN** an MCP tool is masked for an agent
- **THEN** the tool is not exposed to the agent during execution

### Requirement: Request-scoped streaming response
The Agents Worker MUST support request-scoped streaming of responses and tool events back to the Group Controller. The streaming channel is per-request and keeps the Worker and Group Controller active only for the duration of that request.

#### Scenario: Stream response events
- **WHEN** the worker produces tokens or tool events
- **THEN** it streams them on the same request channel

#### Scenario: Streaming does not require persistent connection
- **WHEN** a request completes and there are no in-flight streams
- **THEN** no persistent Worker↔Group Controller connection is required to remain open

### Requirement: Resilient to worker sleep between requests
The Agents Worker MUST treat each request as stateless and MUST NOT require a persistent WebSocket to the Group Controller. The Worker MAY sleep between requests and MUST cold-start safely when a new request arrives.

#### Scenario: Worker cold start
- **WHEN** the worker wakes from sleep and receives a request
- **THEN** it processes the request without relying on prior connection state

### Requirement: Error responses are structured
The Agents Worker MUST return structured error responses with machine-readable codes for the Group Controller.

#### Scenario: Return structured error
- **WHEN** the worker encounters a validation or execution error
- **THEN** it returns a structured error with a code and message
