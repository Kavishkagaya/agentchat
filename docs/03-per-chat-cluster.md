# Per-Chat Cluster

A group is the long-lived chat runtime unit. The Group Controller DO owns active runtime state; the Agents Worker stays stateless.

## Group Controller

- Technology: Cloudflare Durable Objects + SQLite.
- Deterministic identity: Orchestrator resolves DO from `group_id`.
- Initialization payload includes `group_id`, `org_id`, and `history_mode`.
- Access restricted to Orchestrator-forwarded requests (internal service token).

## History Modes

### `history_mode = "internal"`
- Messages are persisted in DO-local SQLite.
- Compaction summary is maintained in local state.
- History reads are served directly from DO state.

### `history_mode = "external"`
- History persistence is delegated externally.
- Runtime routing/proxy behavior remains unchanged.

## Agent Invocation Trust Flow

1. Group Controller receives a user message request.
2. Group Controller mints short-lived agent-access JWT using static GC private key.
3. Group Controller calls Agents Worker with bearer token.
4. Agents Worker verifies token signature/expiry/scope/group+agent claims.
5. Request is executed and result returned; no persistent socket is required.

## Archive Behavior

- Archive is explicit (`manual`) or scheduler-triggered (`auto` after inactivity).
- Group Controller produces a state snapshot payload (messages + compaction metadata).
- Orchestrator writes snapshot to R2 and marks group archived only after successful persistence.
- Active runtime state is cleared after archive snapshot generation.
