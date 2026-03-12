## Purpose
Define orchestrator control-plane runtime for chat activation, routing, proxying, and archive lifecycle.

## Requirements

### Requirement: Infra routes require app-signed auth
The orchestrator MUST reject infra route requests without valid app-signed authorization.

#### Scenario: Reject unsigned infra request
- **WHEN** request to infra endpoint lacks valid app token
- **THEN** orchestrator returns unauthorized response

### Requirement: Activation maps chat to deterministic memory-controller id
The orchestrator MUST derive memory-controller DO id from `config_id`, initialize runtime state, and initialize the memory controller using the persisted chat configuration source of truth so runtime loads finalized prompt and routing metadata from storage.

#### Scenario: Activate chat with persisted routing config available
- **WHEN** `/infra/chats` receives a valid activation request for a newly created chat
- **THEN** orchestrator creates runtime mapping and calls memory-controller init endpoint with the deterministic runtime identity
- **AND** init proceeds against persisted chat config state rather than transient UI payload fields

### Requirement: Activation contract MUST preserve config-first ordering
The orchestrator activation path MUST assume enriched chat config is already committed before activation and MUST fail safely if required runtime config cannot be loaded during init.

#### Scenario: Fail activation when required config is unavailable
- **WHEN** memory-controller init cannot load required chat routing config for the target `config_id`
- **THEN** activation is treated as failed
- **AND** orchestrator does not report successful activation for that chat

### Requirement: Activation enforces org active-chat limits
The orchestrator MUST enforce configured active-chat limit per org.

#### Scenario: Reject activation over limit
- **WHEN** org active chats reach configured threshold
- **THEN** activation is rejected with limit error

### Requirement: Routing token issuance is short-lived and scoped
The orchestrator MUST issue signed routing tokens that include `user_id`, `config_id`, `role`, and expiry.

#### Scenario: Issue routing token
- **WHEN** app requests `/infra/routing-token`
- **THEN** orchestrator returns a scoped routing token

### Requirement: Client proxy routes verify routing token and chat match
The orchestrator MUST validate routing token signature/expiry and enforce `config_id` match for websocket/history/message proxy routes.

#### Scenario: Reject mismatched token
- **WHEN** token chat id differs from route chat id
- **THEN** orchestrator rejects request

### Requirement: Archive writes snapshot and marks archived
The orchestrator MUST archive by requesting memory-controller snapshot, writing to R2, recording archive metadata, and marking chat archived.

#### Scenario: Archive chat runtime
- **WHEN** archive endpoint succeeds
- **THEN** snapshot is stored and runtime status is archived

### Requirement: Delete endpoint tears down runtime mapping
The orchestrator MUST attempt memory-controller destroy and MUST remove runtime database mapping during delete.

#### Scenario: Delete chat runtime
- **WHEN** delete endpoint is called for a chat
- **THEN** runtime mapping is removed and success is returned

### Requirement: Cleanup endpoint updates runtime status
The orchestrator MUST accept cleanup callbacks that set runtime status to `active`, `idle`, or `archived`.

#### Scenario: Cleanup callback
- **WHEN** valid cleanup payload is received
- **THEN** runtime status is updated in worker database
