## Context

Chat lifecycle behavior is uneven across the stack. Delete is end-to-end (web -> orchestrator -> memory controller + DB), while archive exists only as an internal orchestrator path and restore is only implemented at memory-controller level. The dashboard has no archive/restore controls today.

Chat configuration updates are persisted in the primary database, but active memory-controller runtimes keep config in durable object storage from init time. There is no explicit refresh contract after config updates, so routing behavior can become stale until runtime reinitialization.

The change crosses web tRPC routes, dashboard UX, orchestrator infra routes, memory-controller lifecycle routes, and runtime status persistence.

## Goals / Non-Goals

**Goals:**
- Define archive and restore as managed chat lifecycle operations available in workspace UX and API.
- Define deterministic runtime config refresh behavior after chat config updates.
- Keep lifecycle status transitions (`active`, `idle`, `archived`) coherent between control-plane and runtime records.
- Keep persisted DB config as source of truth and ensure runtime reload is explicit, observable, and testable.

**Non-Goals:**
- Redesign chat message schema or archive snapshot format.
- Introduce auto-archive policy or scheduler-based archival in this change.
- Rework agent execution internals beyond config freshness and lifecycle behavior.
- Add cross-org data recovery or backup orchestration outside chat-level archives.

## Decisions

### Decision 1: Add first-class archive/restore operations to workspace chat management
Web chat management will expose archive and restore actions next to delete. These actions will call dedicated tRPC mutations, not generic update endpoints.

Rationale:
- Keeps lifecycle transitions explicit in API and UI.
- Avoids overloading generic patch semantics with operational actions.

Alternatives considered:
- Reuse `chats.update` status patch only: rejected because lifecycle operations include infra side effects (snapshot, restore) beyond a status field.

### Decision 2: Orchestrator owns archive and restore orchestration end-to-end
Archive and restore remain orchestrator-owned control-plane operations. Web routes call orchestrator infra routes; orchestrator coordinates memory-controller routes, R2 snapshot access, and runtime/status persistence.

Rationale:
- Preserves clear ownership boundary for infra operations.
- Keeps user-facing service free of infra sequencing details.

Alternatives considered:
- Web service talks directly to memory-controller/R2: rejected due to coupling and auth surface expansion.

### Decision 3: Restore uses latest archive metadata for deterministic rehydration
Restore flow will resolve the latest archive metadata for a chat, fetch snapshot from R2, call memory-controller restore route, then set runtime status to active and refresh last-active metadata.

Rationale:
- Avoids ambiguity around snapshot selection.
- Reuses existing archive metadata tables and keeps replay deterministic.

Alternatives considered:
- User-selected arbitrary archive restore in this change: rejected to keep scope focused and UI simple.

### Decision 4: Config updates trigger synchronous runtime refresh call
When chat config changes (routing/system prompt/agent setup fields), web update flow persists config then invokes orchestrator config-refresh route before returning success. Title-only updates do not trigger refresh.

Rationale:
- Gives immediate consistency for active runtimes in normal path.
- Keeps refresh logic centralized in orchestrator and runtime.

Alternatives considered:
- Time-based TTL refresh only: rejected because stale behavior is nondeterministic.
- Async best-effort refresh with success response: rejected because caller cannot trust runtime freshness at mutation completion.

### Decision 5: Memory-controller adds explicit config-reload behavior without data wipe
Memory-controller will support a config reload route that refreshes stored config and routing metadata while preserving conversation tables/messages.

Rationale:
- Avoids destructive re-init for simple config edits.
- Keeps refresh fast and minimizes runtime disruption.

Alternatives considered:
- Destroy and re-init on every config update: rejected due to conversation continuity risk and unnecessary churn.

### Decision 6: Status transitions are contract-tested across layers
Lifecycle operations will assert status transitions in both primary config state and runtime state records (`configs` + runtime tables) as part of acceptance tests.

Rationale:
- Prevents partial transitions that produce inconsistent UX and operations.

Alternatives considered:
- Validate only primary DB status: rejected because runtime status drives infra behavior and limits.

## Risks / Trade-offs

- **[Risk] Restore can fail mid-sequence (snapshot found, runtime restore fails)** -> Mitigation: treat restore as failed, preserve archived status, and return explicit error to caller.
- **[Risk] Config refresh failure after DB persist can temporarily leave stale runtime** -> Mitigation: mutation returns failure and emits actionable error; operator/user retries until refresh succeeds.
- **[Risk] Added lifecycle endpoints widen operational surface area** -> Mitigation: keep app-signed auth requirement and add route-level tests for unauthorized access.
- **[Risk] Snapshot payload compatibility drift over time** -> Mitigation: keep restore validation strict and add schema/version checks before row replay.

## Migration Plan

1. Add chat archive/restore mutations in web tRPC router and add dashboard actions for archived/active lifecycle controls.
2. Add orchestrator infra restore route and config-refresh route with signed-auth validation.
3. Add memory-controller config-reload route; keep restore route behavior aligned with runtime metadata expectations.
4. Wire chat update path to call config refresh only when config-bearing fields change.
5. Add tests for lifecycle transitions (archive, restore, delete) and config refresh success/failure paths.
6. Roll out behind existing deployment pipeline; no destructive data migration required.

Rollback strategy:
- Disable new UI actions and revert to delete-only path.
- Leave existing archive records intact; no schema rollback required.
- Keep config-refresh endpoint optional so old update behavior can continue if necessary.

## Open Questions

- Should restore always target latest snapshot, or do we need user-selectable snapshot restore in a follow-up?
- For config refresh failures, do we need automatic retry queueing in orchestrator or is explicit client retry sufficient for this phase?
- Should archive action be allowed while websocket sessions are active, or require pre-archive drain/lock semantics?
