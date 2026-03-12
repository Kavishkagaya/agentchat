## Purpose
Define tool assembly and execution policy for built-in tools and MCP-discovered tools in agent runtime.

## Requirements

### Requirement: Tool registry is built per request
The runtime MUST assemble a request-scoped tool registry from direct tool refs and resolved MCP tool refs.

#### Scenario: Build runtime tools
- **WHEN** agent execution begins
- **THEN** runtime builds effective tool registry for that request

### Requirement: MCP tools require valid server state
The runtime MUST include MCP tools only from MCP servers in valid status.

#### Scenario: Skip invalid MCP server
- **WHEN** MCP server status is not valid
- **THEN** runtime omits tools from that server

### Requirement: MCP token resolution uses secret-backed credentials
The runtime MUST resolve MCP auth tokens from secret references when configured.

#### Scenario: Resolve MCP token
- **WHEN** MCP server has secret reference
- **THEN** runtime loads token from secret storage before tool fetch

### Requirement: HTTP tool enforces allowed-method policy
The HTTP built-in tool MUST enforce configured `allowed_methods` and reject disallowed methods.

#### Scenario: Reject method outside allowlist
- **WHEN** tool request method is not in allowed methods
- **THEN** tool returns `method_not_allowed` error

### Requirement: HTTP mutating methods require explicit approval when not auto-approved
The HTTP built-in tool MUST return approval-required response for mutating calls when `auto_approve` is false.

#### Scenario: Block unapproved mutating request
- **WHEN** request method is mutating and auto-approve is disabled
- **THEN** tool returns `approval_required` response

### Requirement: Tool failures surface as structured stream events
The runtime MUST surface tool failures as structured tool error events in the stream.

#### Scenario: Emit tool error
- **WHEN** tool invocation fails
- **THEN** runtime emits a structured tool error event
