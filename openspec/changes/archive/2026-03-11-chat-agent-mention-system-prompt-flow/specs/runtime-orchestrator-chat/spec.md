## MODIFIED Requirements

### Requirement: Activation maps chat to deterministic memory-controller id
The orchestrator MUST derive memory-controller DO id from `config_id`, initialize runtime state, and initialize the memory controller using the persisted chat configuration source of truth so runtime loads finalized prompt and routing metadata from storage.

#### Scenario: Activate chat with persisted routing config available
- **WHEN** `/infra/chats` receives a valid activation request for a newly created chat
- **THEN** orchestrator creates runtime mapping and calls memory-controller init endpoint with the deterministic runtime identity
- **AND** init proceeds against persisted chat config state rather than transient UI payload fields

## ADDED Requirements

### Requirement: Activation contract MUST preserve config-first ordering
The orchestrator activation path MUST assume enriched chat config is already committed before activation and MUST fail safely if required runtime config cannot be loaded during init.

#### Scenario: Fail activation when required config is unavailable
- **WHEN** memory-controller init cannot load required chat routing config for the target `config_id`
- **THEN** activation is treated as failed
- **AND** orchestrator does not report successful activation for that chat
