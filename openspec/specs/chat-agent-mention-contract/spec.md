## Purpose
Define deterministic nickname-based mention routing for chat messages across user-origin and agent-origin paths.

## Requirements

### Requirement: Nickname mentions MUST resolve through chat mapping
The system MUST treat `@nickname` tokens as user-facing identifiers and resolve them to infrastructure `agent_id` values using the chat's persisted nickname mapping.

#### Scenario: Resolve valid mention
- **WHEN** a message contains one or more valid `@nickname` mentions configured for the chat
- **THEN** the system resolves each valid nickname to its mapped `agent_id`
- **AND** only resolved `agent_id` values are eligible trigger targets

#### Scenario: Ignore unknown mention
- **WHEN** a message contains `@nickname` values that are not present in the chat mapping
- **THEN** unknown mentions are ignored for direct mention targeting

### Requirement: Routing precedence MUST be deterministic
The system MUST evaluate routing outcomes in this order: valid mention targets first, then default-agent fallback when allowed, otherwise no trigger.

#### Scenario: Mention targets take precedence
- **WHEN** a message has at least one valid mention target
- **THEN** the system triggers only the resolved mention targets
- **AND** the default-agent fallback is not applied

#### Scenario: Default fallback when no valid mention targets
- **WHEN** a message has no valid mention targets and chat config has `auto=true` with `default_agent` configured
- **THEN** the system triggers the configured default agent

#### Scenario: Stop when no routing target exists
- **WHEN** a message has no valid mention targets and fallback conditions are not satisfied
- **THEN** the system triggers no agents
- **AND** routing stops for that message

### Requirement: Agent-origin mention chaining MUST be gated by auto mode
The system MUST allow agent-origin messages to trigger mentioned agents only when chat config has `auto=true`.

#### Scenario: Agent-origin mention allowed in auto mode
- **WHEN** an agent-origin message contains valid mentions and `auto=true`
- **THEN** the system may trigger the resolved mentioned agents

#### Scenario: Agent-origin mention blocked in manual mode
- **WHEN** an agent-origin message contains valid mentions and `auto=false`
- **THEN** the system MUST NOT trigger additional agents from that message
