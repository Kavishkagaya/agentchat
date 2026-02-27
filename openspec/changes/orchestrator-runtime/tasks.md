## 1. Orchestrator Auth And Activation

- [x] 1.1 Enforce app-signed authentication on `POST /infra/groups` and `POST /infra/routing-token` with no state mutation on auth failure
- [x] 1.2 Implement deterministic `group_controller_id` derivation from `group_id` and idempotent upsert of group runtime activation state
- [x] 1.3 Extend group activation payload and validation to include `history_mode`, and forward it in Group Controller init
- [x] 1.4 Enforce per-org active-group limits during activation with structured limit errors

## 2. Routing Token And Proxy Chain

- [x] 2.1 Issue short-lived routing tokens with required claims (`user_id`, `group_id`, `role`, `exp`) and signature verification support
- [x] 2.2 Validate routing token and requested `group_id` match before WS upgrade/proxy, rejecting mismatched or expired tokens
- [x] 2.3 Enforce strict runtime chain by rejecting direct, non-app-authenticated control-plane access paths
- [x] 2.4 Add idempotent `POST /infra/cleanup` handling to transition runtime state on GC lifecycle callbacks

## 3. Group Controller To Agents Trust Flow

- [x] 3.1 Implement GC minting of short-lived agent-access JWTs using static GC signing keys (no per-group session keys)
- [x] 3.2 Implement Agents Worker verification of GC-signed agent-access JWTs (signature, expiry, scope/group claims)
- [x] 3.3 Ensure worker invocation/streaming remains request-scoped and does not require persistent GC↔Worker sockets between requests

## 4. History Lifecycle And Archival

- [x] 4.1 Keep active history and compaction context in DO-local state for `history_mode = \"internal\"`
- [x] 4.2 Support `history_mode = \"external\"` by delegating history persistence while preserving routing/runtime behavior
- [x] 4.3 Implement manual archive flow to export group state snapshot to R2 and mark group archived on success
- [x] 4.4 Implement inactivity scheduler path to auto-archive groups after 7 days, with R2 writes only during archive

## 5. Workspace Config Ownership And Secret References

- [x] 5.1 Enforce one canonical config object per domain per workspace (group/provider/MCP) and reference-by-id from dependent records
- [x] 5.2 Ensure credential references use workspace `secret_id` (UUID) and resolve secret values only from secret store at runtime
- [x] 5.3 Keep performance query columns/indexes alongside canonical JSON config objects without duplicating config blobs

## 6. Verification And Documentation

- [ ] 6.1 Add/update integration tests for auth failures, token validation, activation idempotency, and active-group-limit rejection paths
- [ ] 6.2 Add/update lifecycle tests for archive/restore and inactivity auto-archive behavior with R2-on-archive-only assertions
- [x] 6.3 Update architecture docs (`docs/01-overview.md`, `docs/02-global-control-plane.md`, `docs/03-per-chat-cluster.md`, `docs/08-postgres-schema.md`) to match implemented runtime and data contracts
