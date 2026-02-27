# Global Control Plane

The Orchestrator is the global control plane for group runtime identity, routing, lifecycle, and cost controls.

## Core Responsibilities

- Deterministic `group_controller_id` derivation from `group_id`.
- Group activation and runtime-state upsert.
- Short-lived routing-token issuance.
- Runtime proxy authorization checks.
- Active-group limit enforcement per org.
- Lifecycle transitions (`active`, `idle`, `archived`) via infra callbacks.
- Manual and scheduled archive orchestration to R2.

## Infra API Contracts

### `POST /infra/groups`
- Requires valid app-signed auth.
- Validates payload (`group_id`, `org_id`, optional `history_mode`).
- Enforces per-org active-group limit.
- Upserts runtime routing state.
- Initializes Group Controller with `{ group_id, org_id, history_mode }`.

### `POST /infra/routing-token`
- Requires valid app-signed auth.
- Issues short-lived routing token with `user_id`, `group_id`, `role`, `exp`.

### `POST /infra/cleanup`
- Requires valid app-signed auth.
- Idempotently updates lifecycle state based on Group Controller callback payload.

### `POST /infra/groups/{group_id}/archive`
- Requires valid app-signed auth.
- Requests Group Controller archive snapshot.
- Persists snapshot to R2.
- Records archive metadata and marks group archived on success.

## Runtime Proxy Chain

Required chain: `client -> app -> orchestrator -> group controller`.

- Orchestrator validates app auth and routing token before proxying `GET /groups/{group_id}/history` and `GET|WS /groups/{group_id}/ws`.
- Group Controller only accepts calls carrying the internal orchestrator service token.
- Direct, non-app-authenticated control-plane access is rejected.

## Scheduled Auto-Archive

- Scheduler scans active/idle groups by inactivity threshold (default 7 days).
- Auto-archive path uses the same archive flow as manual archive.
- R2 writes happen only during archive, never during active runtime.

## Authority Boundaries

- **Orchestrator**: authoritative for infra routing/lifecycle state.
- **Group Controller**: authoritative for active in-group runtime state.
- **R2**: authoritative for archived snapshots.
