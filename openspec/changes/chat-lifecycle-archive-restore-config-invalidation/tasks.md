## 1. Web Chat Lifecycle API and UX

- [ ] 1.1 Add `chats.archive` and `chats.restore` mutations in the web tRPC router with org-scoped authorization checks
- [ ] 1.2 Extend chat dashboard/chat detail UI with archive and restore actions based on lifecycle status
- [ ] 1.3 Ensure chat list/detail views expose and render lifecycle status (`active`, `idle`, `archived`) consistently
- [ ] 1.4 Add client-side success/error handling for archive and restore actions (loading states, failures, refetch/invalidation)

## 2. Orchestrator Lifecycle Endpoints

- [ ] 2.1 Add an authenticated infra restore route for chats (select latest archive metadata, load snapshot from R2, call memory-controller restore)
- [ ] 2.2 Update archive route handling to fail without marking chat archived when snapshot export/persistence fails
- [ ] 2.3 Add an authenticated infra config-refresh route for chats that reloads runtime config from persisted storage
- [ ] 2.4 Extend the web orchestrator client with `archiveChat`, `restoreChat`, and `refreshChatConfig` methods

## 3. Memory Controller Runtime Behavior

- [ ] 3.1 Add a config reload route/handler that updates stored chat config metadata without deleting message/history tables
- [ ] 3.2 Ensure repeated init/re-init for an existing `config_id` overwrites stored runtime config metadata deterministically
- [ ] 3.3 Harden restore route validation for malformed or missing snapshot payloads and return explicit validation errors
- [ ] 3.4 Ensure restore success keeps runtime usable for subsequent message routing with restored data

## 4. Chat Update Refresh Contract

- [ ] 4.1 Update web chat update flow to detect config-bearing field changes and invoke orchestrator config refresh before returning success
- [ ] 4.2 Keep title-only updates on the non-refresh path and verify no config-refresh call is made
- [ ] 4.3 Ensure refresh failures are surfaced as mutation failures with actionable error messaging

## 5. Status Consistency and Persistence

- [ ] 5.1 Verify archive and restore flows update both primary chat status and runtime status records coherently
- [ ] 5.2 Verify delete flow behavior remains correct for archived chats and still tears down runtime before DB removal

## 6. Verification

- [ ] 6.1 Add web/router tests for archive/restore authorization and org scoping
- [ ] 6.2 Add orchestrator tests for archive failure behavior, restore success/no-snapshot failure, and config-refresh success/failure
- [ ] 6.3 Add memory-controller tests for config reload preserving history and restore payload validation
- [ ] 6.4 Add integration-style tests for chat update refresh contract (config change refreshes, title-only does not)
