## Purpose
Define workspace agent management, public catalog access, and publish/copy behavior.

## Requirements

### Requirement: Agent list and get are org-scoped
The system MUST return only agents owned by the authenticated org for list/get operations.

#### Scenario: List agents
- **WHEN** an org user requests agents
- **THEN** the system returns agents for that org

#### Scenario: Read unknown agent
- **WHEN** an org user requests an unavailable agent id
- **THEN** the system returns not found

### Requirement: Agent creation requires a valid model reference
The system MUST require `modelId` to exist in the same org before agent creation.

#### Scenario: Create agent with invalid model id
- **WHEN** create input references a missing model id
- **THEN** the system rejects the request

### Requirement: Agent config model cannot diverge from selected model
The system MUST reject creation when `config.model` differs from selected model catalog `modelId` value.

#### Scenario: Mismatched model fields
- **WHEN** create input includes both modelId and divergent config.model
- **THEN** the system rejects the request as invalid

### Requirement: Agent updates validate replacement model references
The system MUST validate provided model id during update before persisting.

#### Scenario: Update agent with invalid model
- **WHEN** update payload provides unknown model id
- **THEN** the system rejects the request

### Requirement: Public agent discovery and copy are supported
The system SHALL expose public agent metadata and MUST allow copy into org scope.

#### Scenario: Copy public agent
- **WHEN** a user selects a public agent
- **THEN** the system creates an org-owned copy

### Requirement: Agent publishing is supported
The system MUST allow publishing an org-owned agent into the public catalog flow.

#### Scenario: Publish agent
- **WHEN** a user publishes an existing org agent
- **THEN** the system executes publish flow successfully
