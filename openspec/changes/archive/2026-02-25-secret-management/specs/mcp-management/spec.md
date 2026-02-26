## MODIFIED Requirements

### Requirement: Add MCP flow captures required fields
The system SHALL require MCP URL, secret reference (auth token), and required metadata when adding an MCP server.

#### Scenario: Add MCP form validation
- **WHEN** a user submits an MCP server
- **THEN** missing required fields cause a validation error

### Requirement: MCP servers are validated by fetching tool lists
When an MCP server is added, the system MUST validate it by fetching its tool list in a worker-only environment using the resolved secret value for auth.

#### Scenario: Validate MCP server
- **WHEN** an MCP server is added
- **THEN** the system resolves the secret reference for the org and fetches tools, recording validation status
