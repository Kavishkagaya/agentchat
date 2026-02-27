## ADDED Requirements

### Requirement: Infra endpoints require app-signed authentication
The Orchestrator MUST reject infra API requests that are not authenticated with a valid app-signed token.

#### Scenario: Reject unsigned infra request
- **WHEN** a request to `POST /infra/groups` or `POST /infra/routing-token` lacks a valid app signature
- **THEN** the Orchestrator returns an authentication error and performs no state changes

### Requirement: Group activation maps to a deterministic Group Controller
On group activation, the Orchestrator MUST derive a deterministic Group Controller Durable Object id from `group_id` and persist routing state without creating per-group session keys.

#### Scenario: Activate group stores routing state
- **WHEN** the Orchestrator receives a valid `POST /infra/groups` request
- **THEN** it resolves the Group Controller DO id from `group_id` and stores/updates the routing record with `group_controller_id` and active status

### Requirement: Group activation accepts history mode configuration
The Orchestrator MUST accept a `history_mode` in the activation request and pass it to the Group Controller as part of the init payload.

#### Scenario: Activation forwards history mode
- **WHEN** the app activates a group with `history_mode = "external"`
- **THEN** the Orchestrator forwards the history mode to the Group Controller for that group

### Requirement: Routing token issuance is short-lived and scoped
The Orchestrator MUST issue short-lived routing tokens that include `user_id`, `group_id`, and `role` claims.

#### Scenario: Issue routing token
- **WHEN** the app requests a routing token for a user and group
- **THEN** the Orchestrator returns a token containing `user_id`, `group_id`, `role`, and an expiry

### Requirement: WebSocket proxy validates routing token and group match
The Orchestrator MUST validate the routing token before upgrading and proxying the WebSocket, and MUST reject tokens that do not match the requested group.

#### Scenario: Reject mismatched routing token
- **WHEN** a WebSocket request presents a routing token with a different `group_id`
- **THEN** the Orchestrator rejects the upgrade with an authorization error

### Requirement: Strict request chain is enforced
The system MUST enforce the fixed chain `client → app → orchestrator → group controller` for runtime access, with no direct client access to orchestrator or group controller endpoints.

#### Scenario: Direct client access is rejected
- **WHEN** a client attempts to call a Group Controller or Orchestrator runtime endpoint without an app-signed request
- **THEN** the request is rejected

### Requirement: Group Controller mints agent-access tokens
The Group Controller MUST mint short-lived agent-access tokens for Agents Worker calls using a static GC signing key, and the Agents Worker MUST verify those tokens.

#### Scenario: Verify agent-access token
- **WHEN** the Agents Worker receives a request with a GC-signed agent-access token
- **THEN** it verifies the token signature and claims before executing the agent request

### Requirement: Archive is the only trigger for R2 snapshots
The Orchestrator MUST only request R2 export when a group is archived (manual or after inactivity), and MUST treat active groups as DO-local state only.

#### Scenario: Auto-archive after inactivity
- **WHEN** a group is inactive for 7 days
- **THEN** the Orchestrator requests the Group Controller to export state to R2 and marks the group archived after success

### Requirement: Active group limits are enforced
The Orchestrator MUST enforce a maximum number of active groups per org and reject activation when the limit is exceeded.

#### Scenario: Activation blocked by org limit
- **WHEN** an org has reached its active-group limit
- **THEN** the Orchestrator rejects new group activation with a limit error

### Requirement: Configuration ownership is single-source per workspace
The system MUST define exactly one canonical config object per domain within a workspace, and all other domains MUST reference canonical records by id instead of duplicating those configs.

#### Scenario: Agent references provider and MCP configs
- **WHEN** an agent is configured in a workspace
- **THEN** it references provider and MCP records by id and does not embed duplicate provider or MCP configuration payloads

### Requirement: Secret references use workspace secret ids
All runtime config references to credentials MUST use workspace `secret_id` identifiers, and services MUST resolve secret values from the secret store at runtime.

#### Scenario: Resolve credential from secret reference
- **WHEN** a config object contains a credential reference
- **THEN** the runtime resolves the referenced `secret_id` from the workspace secret store instead of reading an inline credential value
