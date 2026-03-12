## MODIFIED Requirements

### Requirement: Init persists runtime metadata
Initialization MUST persist `config_id`, topology type, and optional config/org metadata in durable storage, and for chat topology MUST load/store finalized chat routing config (system prompt, nickname mapping, responsibilities, `auto`, and `default_agent`) for message routing decisions. Re-initialization for an existing `config_id` MUST overwrite stored config metadata with the latest persisted configuration.

#### Scenario: Initialize runtime with enriched chat config
- **WHEN** `/init` receives valid chat payload for a configured chat
- **THEN** memory controller stores runtime metadata
- **AND** routing configuration required for mention/default decision logic is available to runtime handlers

#### Scenario: Re-initialize runtime with updated config
- **WHEN** `/init` is called again for an existing chat with updated persisted config
- **THEN** memory controller replaces stored config metadata with the latest config
- **AND** subsequent message routing uses updated config values

### Requirement: Restore can rebuild tables from snapshot
The memory controller MUST support restoring tables from snapshot payload when restore route is called and MUST reject invalid snapshot payloads.

#### Scenario: Restore from snapshot
- **WHEN** valid restore payload is provided
- **THEN** tables are recreated and rows are inserted

#### Scenario: Reject invalid restore payload
- **WHEN** restore payload is missing or malformed snapshot table data
- **THEN** memory controller returns validation error
- **AND** restore is not applied

## ADDED Requirements

### Requirement: Config reload updates runtime routing metadata without destroying message history
The memory controller MUST support config reload behavior that updates stored chat routing config while preserving existing chat message/history tables.

#### Scenario: Reload config for active runtime
- **WHEN** config reload is requested for an initialized chat runtime
- **THEN** memory controller updates stored config metadata to the new values
- **AND** existing message/history tables remain intact
