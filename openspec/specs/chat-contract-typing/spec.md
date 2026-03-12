## Purpose
Define a single canonical source of truth for chat contract typing used across API, persistence, and runtime layers.

## Requirements

### Requirement: Chat typing interfaces MUST have a single canonical source
The system MUST define chat config and routing-related interfaces in one shared module and MUST treat that module as the only source of truth for cross-service chat contracts.

#### Scenario: Define canonical contract module
- **WHEN** chat contract types are introduced or changed
- **THEN** the authoritative interface definitions exist in a single shared module
- **AND** no parallel authoritative contract definitions are introduced in service-local files

### Requirement: API and runtime layers MUST consume canonical chat contract types
Web API, database service boundaries, orchestrator payload typings, and memory-controller typings MUST import the canonical chat contract interfaces instead of redefining duplicate local interfaces.

#### Scenario: Update contract in one place
- **WHEN** a chat contract field is added or changed in the canonical module
- **THEN** dependent layers consume the updated type via imports
- **AND** type checking identifies call sites that require updates

### Requirement: Runtime config persistence and read paths MUST use the same contract shape
The type used for persisted chat config writes and the type used for runtime config reads MUST represent the same canonical contract structure.

#### Scenario: Persist and read aligned config
- **WHEN** chat config is written at creation/update and later read for runtime initialization
- **THEN** both paths use the canonical contract type
- **AND** no service-specific shape translation is required for core fields
