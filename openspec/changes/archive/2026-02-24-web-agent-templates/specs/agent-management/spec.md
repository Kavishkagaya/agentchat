## ADDED Requirements

### Requirement: Agents list shows org agents
The system SHALL list agents belonging to the current org on the Agents page.

#### Scenario: List org agents
- **WHEN** a user opens the Agents page
- **THEN** the system shows agents for the user’s org

### Requirement: Add agent entry point opens global list
The system SHALL provide an “Add agent” action that opens a modal with global/public agents and a Create option.

#### Scenario: Open add agent modal
- **WHEN** a user clicks “Add agent”
- **THEN** a modal opens with a global agent list and a Create CTA

### Requirement: Create agent flow opens full creation page
The system SHALL open a dedicated agent creation page from the Create CTA.

#### Scenario: Navigate to create agent
- **WHEN** a user clicks the Create CTA in the add agent modal
- **THEN** the system routes to the agent creation page

### Requirement: Agent creation supports MCP selection and tool picks
The agent creation page MUST allow selecting MCP servers, fetching their tools, and choosing allowed tools.

#### Scenario: Select MCP tools
- **WHEN** a user selects an MCP server during agent creation
- **THEN** the system fetches tools and lets the user choose tools to attach to the agent
