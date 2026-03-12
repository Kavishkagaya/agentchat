## Purpose
Define chat CRUD and chat-runtime bootstrap behavior in the web tRPC layer.

## Requirements

### Requirement: Chat listing and retrieval are org-scoped
The system MUST scope chat list and chat get operations to the authenticated org.

#### Scenario: List org chats
- **WHEN** an authenticated org user requests chat list
- **THEN** the system returns chats for that org

#### Scenario: Get missing chat
- **WHEN** a user requests a chat id that does not exist
- **THEN** the system returns a not found error

### Requirement: Chat creation initializes runtime defaults
The system MUST merge default chat config values when a chat is created, and MUST validate/persist required routing metadata for selected agents (nickname and responsibility), routing flags (`auto`, `default_agent`), and finalized `system_prompt`.

#### Scenario: Create chat with complete routing metadata
- **WHEN** a user creates a chat with selected agents, complete nickname/responsibility values, valid routing flags, and a finalized prompt
- **THEN** the chat is created with default runtime config fields merged
- **AND** the enriched routing metadata is persisted in chat config

#### Scenario: Reject create with incomplete agent metadata
- **WHEN** a user attempts chat creation while any selected agent is missing nickname or responsibility
- **THEN** the system rejects creation with validation error

#### Scenario: Reject invalid default agent selection
- **WHEN** `auto=true` and `default_agent` is missing or is not one of the selected chat agents
- **THEN** the system rejects creation with validation error

### Requirement: Chat creation activates orchestrator runtime
The system MUST call orchestrator activation after database chat creation, and only after enriched chat config is successfully persisted so memory-controller init can load finalized prompt and routing metadata.

#### Scenario: Activate new chat runtime with persisted config
- **WHEN** chat creation and enriched config persistence succeed in database
- **THEN** the web service requests orchestrator chat activation using the new chat id

#### Scenario: Do not activate when persistence fails
- **WHEN** chat creation transaction fails before enriched config persistence completes
- **THEN** the web service MUST NOT request orchestrator activation

### Requirement: Routing token issuance is available for chat clients
The system MUST provide routing token issuance for chat runtime access.

#### Scenario: Get routing token for chat
- **WHEN** a user requests token for a chat id
- **THEN** the system returns an orchestrator-issued routing token

### Requirement: Chat history is fetched through orchestrator proxy
The system MUST fetch chat history via orchestrator instead of direct memory-controller access.

#### Scenario: Fetch chat history
- **WHEN** a user requests chat history
- **THEN** the web service obtains a routing token and fetches history through orchestrator

### Requirement: Chat deletion tears down runtime then data
The system MUST delete runtime infrastructure before removing chat records from primary database.

#### Scenario: Delete chat
- **WHEN** a user deletes a chat
- **THEN** the system calls orchestrator delete and then deletes chat records

### Requirement: Chat creation UI contract MUST support two-step setup
The system MUST support a two-step chat creation contract where agent configuration is completed before prompt review/edit and final create.

#### Scenario: Two-step create payload consistency
- **WHEN** step 1 agent configuration and step 2 prompt edit are completed
- **THEN** the final create request includes selected agents, nickname/responsibility mapping, routing flags, and finalized `system_prompt` in one validated payload
