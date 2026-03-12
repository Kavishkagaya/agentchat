## MODIFIED Requirements

### Requirement: Chat listing and retrieval are org-scoped
The system MUST scope chat list and chat get operations to the authenticated org and MUST include chat lifecycle status values (`active`, `idle`, `archived`) in returned chat records for lifecycle management UX.

#### Scenario: List org chats
- **WHEN** an authenticated org user requests chat list
- **THEN** the system returns chats for that org with lifecycle status for each chat

#### Scenario: Get missing chat
- **WHEN** a user requests a chat id that does not exist
- **THEN** the system returns a not found error

### Requirement: Chat deletion tears down runtime then data
The system MUST delete runtime infrastructure before removing chat records from primary database for chats in any lifecycle status.

#### Scenario: Delete chat
- **WHEN** a user deletes a chat
- **THEN** the system calls orchestrator delete and then deletes chat records

#### Scenario: Delete archived chat
- **WHEN** a user deletes a chat whose status is `archived`
- **THEN** the system calls orchestrator delete and then deletes chat records

## ADDED Requirements

### Requirement: Chat lifecycle supports archive and restore actions
The system MUST provide archive and restore chat actions in workspace chat management and route them through orchestrator lifecycle operations.

#### Scenario: Archive chat from workspace flow
- **WHEN** a user archives an `active` or `idle` chat
- **THEN** the system requests orchestrator archive for that chat
- **AND** the chat status becomes `archived` after archive succeeds

#### Scenario: Restore archived chat from workspace flow
- **WHEN** a user restores an `archived` chat
- **THEN** the system requests orchestrator restore for that chat
- **AND** the chat status becomes `active` after restore succeeds

### Requirement: Chat config updates refresh runtime config deterministically
The system MUST refresh runtime chat config through orchestrator whenever config-bearing fields are updated, and MUST return success only when refresh succeeds.

#### Scenario: Update chat config and refresh runtime
- **WHEN** a user updates chat config fields that affect routing or system prompt behavior
- **THEN** the system persists the updated config
- **AND** the system requests orchestrator runtime config refresh for that chat before returning success

#### Scenario: Update chat title without config refresh
- **WHEN** a user updates only chat title with no config-bearing field changes
- **THEN** the system updates title without issuing runtime config refresh
