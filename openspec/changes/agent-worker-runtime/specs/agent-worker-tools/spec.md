## ADDED Requirements

### Requirement: Tool registry is assembled per request
The Agents Worker MUST assemble the available tool registry per request using the agent’s tool allowlist and MCP selections.

#### Scenario: Assemble tools for agent
- **WHEN** a request is received for an agent
- **THEN** the worker builds the tool registry from the agent’s allowed tools and MCP selections

### Requirement: Built-in tools are always available when allowed
The Agents Worker MUST include built-in tools in the registry when they are allowed by the agent configuration.

#### Scenario: Include built-in tools
- **WHEN** an agent allows built-in tools
- **THEN** the worker includes those tools in the registry

### Requirement: MCP tools require validated MCP metadata
The Agents Worker MUST only expose MCP tools that come from validated MCP server metadata.

#### Scenario: Exclude unvalidated MCP tools
- **WHEN** an MCP server lacks validated metadata
- **THEN** the worker does not expose its tools

### Requirement: MCP tool masking is enforced
The Agents Worker MUST enforce MCP tool masking rules when exposing MCP tools.

#### Scenario: Masked MCP tool omitted
- **WHEN** an MCP tool is masked for an agent
- **THEN** that tool is omitted from the registry

### Requirement: HTTP tool policy is enforced
The Agents Worker MUST enforce HTTP tool method and approval policies for mutating calls.

#### Scenario: Block unapproved mutating call
- **WHEN** an HTTP tool call uses a mutating method without approval
- **THEN** the worker blocks the call and returns a policy error

### Requirement: Tool execution uses scoped secrets
The Agents Worker MUST provide tool execution with scoped secrets and MUST NOT leak secret values to the model.

#### Scenario: Execute tool with scoped secret
- **WHEN** a tool requires a secret value
- **THEN** the worker supplies it to the tool runtime without adding it to model context

### Requirement: Tool failures are reported to the Group Controller
The Agents Worker MUST return structured tool failure events in the response stream.

#### Scenario: Tool error event
- **WHEN** a tool execution fails
- **THEN** the worker emits a structured error event in the response stream
