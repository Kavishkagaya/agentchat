## Why

Chat lifecycle behavior is inconsistent: delete is exposed end-to-end, while archive/restore is only partially wired and not available in user-facing flows. Chat configuration updates also do not reliably refresh active runtime state, which can leave routing and prompt behavior stale after edits.

## What Changes

- Expose archive and restore as first-class chat lifecycle operations in workspace chat management flows, alongside delete.
- Define orchestrator contract changes so archive and restore are fully managed control-plane operations rather than dormant internals.
- Define runtime config refresh/invalidation behavior so chat config edits are reflected by active memory-controller runtimes within a deterministic contract.
- Align UI/API/runtime status semantics for `active`, `idle`, and `archived` transitions to prevent drift between control-plane state and runtime state.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `workspace-chat-management`: Extend chat lifecycle requirements beyond delete to include archive/restore user flows and config-update behavior that guarantees runtime consistency.
- `runtime-orchestrator-chat`: Expand archive lifecycle requirements to include restore orchestration and explicit config refresh/invalidation pathways for running chats.
- `runtime-memory-controller`: Strengthen lifecycle requirements for restore and runtime config reload so persisted config changes can be applied safely to active chat handlers.

## Impact

- Affected systems: web dashboard chat UX, web tRPC chats router, orchestrator infra routes, memory-controller lifecycle endpoints, and runtime status persistence.
- Affected data/contracts: chat lifecycle APIs (archive/restore), runtime state transitions, and config propagation guarantees from primary DB to runtime.
- Operational impact: clearer managed lifecycle behavior, reduced stale-config incidents, and explicit restore path ownership across control-plane components.
