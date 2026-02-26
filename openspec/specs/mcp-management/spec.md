## ADDED Requirements

### Requirement: MCPs page lists org MCP servers
The system SHALL list MCP servers added by the current org on the MCPs page.

#### Scenario: List MCP servers
- **WHEN** a user opens the MCPs page
- **THEN** the system shows MCP servers for the org

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

### Requirement: MCP tools are available for selection
The system MUST expose MCP tools for selection during agent creation.

#### Scenario: Select MCP tools
- **WHEN** a user selects an MCP server in agent creation
- **THEN** its tools are available to pick for the agent
