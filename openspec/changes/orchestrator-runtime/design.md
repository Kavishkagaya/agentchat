## Context

The Orchestrator is the global control plane and already exposes infra endpoints for group activation and routing tokens. Group Controller (Durable Object) owns in-chat state and agent triggering. The current docs and schema blur “group” vs “chat,” and the trust flow still mentions per-group session keypairs. The product direction is: group == long-lived chat (channel-like), no multiple chats per group. Users create new groups for new topics, and archive groups when done. We need a clear runtime design that enforces a strict connection chain (client → app → orchestrator → group controller), avoids per-group dynamic keys, and minimizes infra overhead while keeping history durable.

Constraints:
- Client must only connect to the app webserver (no direct client → orchestrator or client → group controller).
- The Group Controller is a DO instance inside the chat-controller worker; no per-instance env injection.
- R2 should only be used for archive snapshots (manual or auto-archive), not for active history.

## Goals / Non-Goals

**Goals:**
- Define the runtime message flow and trust model for orchestrator, app, group controller, and agents worker.
- Keep group history in the Group Controller DO with compaction for context, and archive only on inactivity or manual archive.
- Support multiple concurrent users per group via a single upstream connection chain.
- Enforce active group limits and allow archive/restore to manage infra cost.
- Align docs/specs with “group == chat” and the new trust flow.

**Non-Goals:**
- Multi-chat threads within a group.
- New external auth provider integrations.
- Full billing/quotas implementation beyond active-group limits.
- Detailed UI/UX for archive/restore beyond API behavior.

## Decisions

1. **Group == Chat (single long-lived conversation).**
Rationale: This aligns with the channel model and keeps infra units simple. Users create a new group for a new topic. Single-user multi-topic use cases are handled by creating multiple groups and optionally cloning settings.
Alternatives considered: multi-chat threads inside a group; separate “project” container with multiple chats. Rejected for now to avoid extra data models and runtime complexity.

2. **Connection chain is fixed: client → app → orchestrator → group controller.**
Rationale: The app is the only public endpoint; it multiplexes client websockets and maintains one upstream WS per active group. Orchestrator validates routing tokens and proxies to the GC DO.
Alternatives considered: client → orchestrator direct; app → orchestrator HTTP callbacks. Rejected to preserve the “no skipped hops” policy and because HTTP callbacks increase latency/complexity for streaming.

3. **No per-group session keypairs; use static service keys + short-lived JWTs.**
Rationale: Per-group private keys require secure transport and per-instance storage. Instead, the GC mints short-lived agent-access tokens with a static GC private key. Agents Worker verifies with GC public key. Orchestrator issues routing tokens with its static key. App signs infra requests with its static key.
Alternatives considered: Orchestrator-generated session keypairs and session certificates. Rejected due to private key transport and added complexity.

4. **Group Controller owns full history and compacted context; R2 only on archive.**
Rationale: Active chats need fast access and low latency; DO storage and local SQLite are the best fit. R2 is reserved for long-idle archival to reduce storage/compute costs.
Alternatives considered: continuous R2 streaming or periodic snapshots. Rejected to keep R2 operations minimal and avoid consistency complexity.

5. **Archive/restore is the primary cost control.**
Rationale: Active group limits enforce infra cost. Users can archive to free capacity and restore when needed. Auto-archive after 7 days of inactivity provides safety.
Alternatives considered: per-user soft caps without archive. Rejected because it does not guarantee infra cost control.

6. **App fan-out with one upstream WS per active group.**
Rationale: The app is the single client entry point. It can multiplex all client connections for a group over a single upstream connection to Orchestrator/GC, reducing internal websocket counts.
Alternatives considered: one upstream per client. Rejected due to unnecessary infra load and duplicated state.

## Risks / Trade-offs

- **GC history growth** → Add compaction and optional size thresholds; rely on summary + rolling window for context assembly.
- **Single upstream WS per group becomes a bottleneck** → Monitor fan-out load; if needed, shard by group or add per-group backpressure.
- **JWT replay risks for agent-access tokens** → Use short TTLs, include `jti`, and optionally keep a small LRU cache of recent `jti` in the Agents Worker.
- **Hard dependency on app availability** → The app is now a critical path; mitigate with horizontal scaling and WS load balancing.
- **Archived groups are read-only** → Require explicit restore to avoid confusing users; ensure UI clearly indicates archive state.

## Migration Plan

1. Update docs to reflect group==chat and archive semantics:
- `docs/08-postgres-schema.md` (remove “chats table represents groups” mismatch, clarify group is chat)
- `docs/01-overview.md` and `docs/02-global-control-plane.md` (update trust flow to static keys + JWTs)
- `docs/03-per-chat-cluster.md` (archive/restore behavior and R2 usage only on archive)

2. Update Orchestrator runtime:
- Add app-signed auth for infra endpoints.
- Keep routing token issuance, WS proxy, and lifecycle hooks.
- Remove dependency on per-group session keypairs for GC.

3. Update Group Controller:
- Maintain history + summaries in DO storage.
- Mint agent-access JWTs for calls to Agents Worker.
- Implement archive/export on manual or auto-archive triggers and rehydrate on restore.

4. Update Agents Worker:
- Verify agent-access JWTs using GC public key.
- Enforce scopes and TTL.

5. Add/adjust data model and limits:
- Track group state as active/archived in DB.
- Enforce max active groups per org; allow restore only if capacity available.

Rollback strategy: preserve existing routing token flow; do not remove session key fields immediately. Keep backward-compatible token verification until all services are updated.

## Open Questions

- Token formats and TTLs: routing token expiry vs agent-access token expiry.
- Where to store GC public key (env vs config service), and how to rotate it safely.
- Whether to keep `group_runtime.public_key` field (currently unused) or remove it in a later migration.
- Archive size limits and compaction thresholds for DO history.
- Whether GC should re-verify routing tokens on every message or only on WS upgrade.
