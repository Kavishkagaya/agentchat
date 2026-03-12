## Purpose
Define MCP server registration, validation, tool discovery, and lifecycle management in workspace APIs.

## Requirements

### Requirement: MCP list is org-scoped
The system MUST return MCP servers only for the authenticated org.

#### Scenario: List MCP servers
- **WHEN** a user requests MCP list
- **THEN** the system returns org MCP servers

### Requirement: MCP add/update require valid URL input
The system MUST validate MCP URL format on add and update operations.

#### Scenario: Add invalid MCP URL
- **WHEN** add payload contains invalid URL
- **THEN** the system rejects the request

### Requirement: MCP auth can resolve bearer token from secret store
When `secretId` is supplied, the system MUST resolve the secret value from the org secret store before validation fetch.

#### Scenario: Add MCP with secret id
- **WHEN** add payload includes secret id
- **THEN** the system resolves bearer token from secret storage

### Requirement: MCP validation sets runtime status
The system MUST attempt MCP tool fetch and persist server status as `valid` on success or `error` on failure.

#### Scenario: Validation success
- **WHEN** tool fetch succeeds
- **THEN** status becomes valid

#### Scenario: Validation failure
- **WHEN** tool fetch fails
- **THEN** status becomes error with message

### Requirement: MCP preview and list-tools return discovered tools
The system MUST expose discovered MCP tools for preview and for saved server ids.

#### Scenario: Preview tools
- **WHEN** user requests tool preview with URL and optional secret
- **THEN** system returns discovered tool metadata

### Requirement: MCP deletion removes server records
The system MUST delete an existing MCP server for the org when requested.

#### Scenario: Delete MCP server
- **WHEN** delete is requested for existing server id
- **THEN** the server is removed
