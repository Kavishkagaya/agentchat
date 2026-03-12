## Purpose
Define durable memory-controller runtime behavior for chat/workflow initialization, websocket handling, and lifecycle actions.

## Requirements

### Requirement: Memory-controller requests require orchestrator signature
The memory controller MUST verify orchestrator-signed bearer tokens for non-dev routes.

#### Scenario: Reject unauthorized request
- **WHEN** request lacks valid orchestrator signature
- **THEN** memory controller returns forbidden

### Requirement: Init persists runtime metadata
Initialization MUST persist `config_id`, topology type, and optional config/org metadata in durable storage, and for chat topology MUST load/store finalized chat routing config (system prompt, nickname mapping, responsibilities, `auto`, and `default_agent`) for message routing decisions.

#### Scenario: Initialize runtime with enriched chat config
- **WHEN** `/init` receives valid chat payload for a configured chat
- **THEN** memory controller stores runtime metadata
- **AND** routing configuration required for mention/default decision logic is available to runtime handlers

### Requirement: Message target resolution MUST use one centralized decision-maker
The system MUST route both user-origin and agent-origin chat messages through one shared decision-maker for target selection.

#### Scenario: Shared resolver for websocket and HTTP ingress
- **WHEN** equivalent logical messages arrive through websocket and HTTP message paths
- **THEN** both paths execute the same target-resolution logic
- **AND** produce identical trigger targets

### Requirement: Mention routing MUST resolve nicknames to agent ids
The decision-maker MUST parse nickname mentions from message text and map valid nicknames to configured `agent_id` targets.

#### Scenario: Route user message with valid mention
- **WHEN** a user-origin message contains valid configured `@nickname` mentions
- **THEN** the decision-maker resolves them to mapped `agent_id` values
- **AND** dispatch targets only those resolved ids

### Requirement: Fallback and stop behavior MUST be deterministic
When no valid mention targets exist, the decision-maker MUST apply default-agent fallback only when `auto=true` and `default_agent` is configured; otherwise it MUST trigger no agents.

#### Scenario: Fallback to default agent
- **WHEN** message has no valid mention targets and config has `auto=true` with `default_agent`
- **THEN** decision-maker selects only `default_agent` for dispatch

#### Scenario: Stop with no target
- **WHEN** message has no valid mention targets and fallback conditions are not satisfied
- **THEN** decision-maker returns no trigger targets
- **AND** the system stops downstream agent triggering for that message

### Requirement: Agent-origin mention triggers MUST be auto-gated
The decision-maker MUST allow agent-origin messages to trigger mentioned agents only when `auto=true`.

#### Scenario: Block agent-origin mention trigger in manual mode
- **WHEN** an agent-origin message includes valid mentions and config has `auto=false`
- **THEN** no additional agents are triggered from that message

### Requirement: Init enforces topology schema
Initialization MUST create topology-specific schema for chat and workflow handlers.

#### Scenario: Init chat topology
- **WHEN** runtime type is `chat`
- **THEN** chat schema tables are ensured

### Requirement: Chat websocket upgrade is supported for chat topology
The memory controller MUST accept websocket upgrade on `/ws` for chat topology and establish websocket pair.

#### Scenario: Open chat websocket
- **WHEN** authorized `/ws` upgrade request is received for chat topology
- **THEN** memory controller upgrades and sends readiness event

### Requirement: Archive exports SQLite user tables
The memory controller MUST export all non-system SQLite tables into snapshot format for archive flow.

#### Scenario: Export archive snapshot
- **WHEN** `/archive` is called
- **THEN** response contains serialized snapshot data

### Requirement: Destroy clears tables and durable keys
The memory controller MUST drop user tables and clear durable key-value storage on destroy.

#### Scenario: Destroy runtime state
- **WHEN** `/destroy` is called
- **THEN** tables and storage entries are removed

### Requirement: Restore can rebuild tables from snapshot
The memory controller MUST support restoring tables from snapshot payload when restore route is called.

#### Scenario: Restore from snapshot
- **WHEN** valid restore payload is provided
- **THEN** tables are recreated and rows are inserted
