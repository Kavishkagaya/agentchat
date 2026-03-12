## MODIFIED Requirements

### Requirement: Archive writes snapshot and marks archived
The orchestrator MUST archive by requesting memory-controller snapshot, writing snapshot to R2, recording archive metadata, and marking chat archived only after snapshot persistence succeeds.

#### Scenario: Archive chat runtime
- **WHEN** archive endpoint succeeds
- **THEN** snapshot is stored and runtime status is archived

#### Scenario: Archive fails before snapshot persistence
- **WHEN** memory-controller snapshot export or R2 write fails
- **THEN** orchestrator returns archive failure
- **AND** chat runtime status is not set to archived

## ADDED Requirements

### Requirement: Restore endpoint rehydrates archived runtime from latest archive snapshot
The orchestrator MUST restore by selecting the latest archive metadata for a chat, loading snapshot from R2, invoking memory-controller restore, and marking chat runtime active on success.

#### Scenario: Restore archived chat runtime
- **WHEN** restore endpoint is called for an archived chat with an available snapshot
- **THEN** orchestrator loads the latest snapshot and requests memory-controller restore
- **AND** runtime status becomes active after restore succeeds

#### Scenario: Restore fails when no archive snapshot exists
- **WHEN** restore endpoint is called and no archive metadata exists for the chat
- **THEN** orchestrator returns restore failure
- **AND** runtime status remains unchanged

### Requirement: Config refresh endpoint reloads runtime config from persisted source of truth
The orchestrator MUST expose a config refresh endpoint that triggers memory-controller config reload using persisted chat config from storage.

#### Scenario: Refresh runtime config after chat config update
- **WHEN** orchestrator receives config refresh request for a chat
- **THEN** orchestrator calls memory-controller config reload/init path using persisted chat config source of truth
- **AND** orchestrator returns success only when reload succeeds
