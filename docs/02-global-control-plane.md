# Global Control Plane (MVP, Single Region)

The Global Control Plane is the always-on layer that owns identity, routing, and lifecycle for all group clusters. It is not a group cluster itself.

## Core Responsibilities

- **Session Orchestrator:** Creates and destroys per-group clusters, assigns the current runtime endpoint, and manages group lifecycle state.
- **Group Controller Identity:** Deterministic Durable Object ID derived from `group_id` (stable across hibernation and crashes).
- **Lifecycle Ownership:** The Orchestrator owns create/delete/idle cleanup. The Group Controller requests lifecycle changes via the infra API.
- **Global Routing Map:** Stable addressing via `group_id`. The routing record maps `group_id` to the Group Controller and current runtime status.
- **Identity & Invites:** Uses **Clerk Organizations** as workspaces. Users join an org, then groups live inside the org. Group membership is stored in the platform database.
- **Billing & Quotas:** Seat-based billing (per org member). Enforce basic limits before cluster creation.
- **Group Metadata DB:** Stores group records, membership, and permissions.
- **Secrets Management:** Stores user or org secrets and injects them into a group cluster when authorized.
- **Observability:** Central logs, lifecycle events, and cost counters for each group.
- **Policy Engine:** MVP can be a stub that enforces a small set of rate limits and abuse checks.
- **Authority Boundaries:** Orchestrator is authoritative for infra state (routing records). Group Controller is authoritative for in-group state (messages, summaries, local task state). R2 is authoritative for archived snapshots. When these disagree, infra state follows Orchestrator, group state follows Group Controller, and archived state follows R2.

## Service Layout (MVP)

- **Split Services:** Orchestrator (infra), gateway, and app/billing are separate services for clearer isolation and scaling.
- **Scheduler Model:** Global background jobs run via Cloudflare Cron Triggers. Per-group timers are handled by Durable Object alarms.
- **Agents Worker:** Single shared stateless service for LLM reasoning. Agent configs and secrets are fetched on demand (cached) and never stored as authoritative state in the worker.

### App vs Infra Responsibilities (MVP)

- **App Layer (UI/API):** Stripe subscriptions, seat counting, billing portal, plan limits stored in Postgres.
- **Infra Layer (Orchestrator/Policy):** Real-time quota enforcement, usage counters, and hard blocks at group creation time.

## Global Routing (MVP)

- **Stable Group URL:** `app.com/g/{group_id}`.
- **Routing Storage:** Neon Postgres (authoritative routing map).
- **Routing Record Fields:** `group_id`, `group_controller_id`, `group_status`, `last_active`, `idle_at`, `region`.

## Access Model (MVP)

- **Workspace:** Clerk Organization.
- **Group:** Entity inside a workspace.
- **Membership:** Default is workspace-wide access for new groups, with an optional "private" flag and explicit group members.
- **Permission Checks:** Enforced in API layer and WebSocket connect.
- **Auth:** Required for all access. Invites are org membership (no guest access in MVP).

## Billing & Quotas (MVP)

- **Payments:** Real billing in MVP via Stripe.
- **Billing Unit:** Seat-based (per org member).
- **Limits:** Org-wide only. Initial limits are max concurrent groups per org.
- **Usage Model:** Seat-based only (no sandbox minutes in MVP).
- **Aggregation:** Orchestrator flushes usage to Postgres for billing and reporting.

## Group Metadata (MVP)

- **Database:** Neon Postgres.
- **Scope:** Group records, membership, permissions, and basic filters.
- **Search:** Simple filtering on the groups table (no full-text or cross-group memory).

## Secrets & Env Profiles (MVP)

- **Org Secrets Store:** Encrypted secrets scoped to orgs (BYOK).
- **Group Grants:** Explicit mapping of which org secrets are allowed for a group.
- **Agent Secrets:** Separate namespace for agent/LLM secrets.
- **Agent Secret Access:** Org-wide by default (MVP), not per group.
- **Env Profiles:** Injection targets for Agent runtime.

## Observability & Audit (MVP)

- **Logs:** Errors and lifecycle events only.
- **Log Storage:** Cloudflare Logpush to R2 (cost-effective).
- **Usage Tracking:** Per-org usage metrics in Neon Postgres.
- **Audit Trails:** Required for org actions (invites, role changes, secrets).

## Policy Engine (MVP)

- **Enforcement:** Hard blocks only.
- **Rules:** Abuse flags and manual org-level blocklist to suspend abuse quickly.
- **Egress Guardrails:** Limit outbound transfer per group/org.

## Infra Manager API (MVP)

- **Exposure:** Internal only. External access is via UI or group API.
- **Endpoints:** Create group, get group.
- **Lifecycle:** Async infra provisioning. Agent message handling remains synchronous with streaming responses.

### Infra Workflows (MVP)

**Create Group**
- Create `groups` record and `group_members`.
- Attach agents to group (from org defaults or explicit selections).
- Create `group_runtime` row with `status = idle`.
- Do not prewarm Group Controller or Agents Worker per group. First message activates the Group Controller; Agents Worker is shared and stateless.

**Stop Group / Idle Cleanup**
- Group Controller detects idle and calls `release_resources`.
- Orchestrator updates status immediately.

**Long-Idle Archive (e.g., 7 days)**
- Orchestrator detects long-idle groups from `last_active`.
- Orchestrator requests the Group Controller to export group state to R2.
- Orchestrator tears down all infra (runtime records) and marks group as archived.
- Group Controller wipes local state after successful export. Rehydration occurs from R2 on next access.
 - Export requests are idempotent; Orchestrator retries on timeout and treats duplicate exports as success if the same R2 path and checksum match.

**Delete Group**
- Hard delete group records and related resources.
- Retain audit logs.

### Group Controller RPC (MVP)

- `release_resources(group_id)`
- `report_usage(group_id, seconds, egress_gb)`
 - All RPCs that create or mutate infra accept an `idempotency_key`.

Quota checks are enforced in the Orchestrator on resource requests. Usage reports flow through the Orchestrator, which can delegate to an internal usage/quota service.

## External Product Interface (MVP)

- **Surface:** UI only.
- **Public API:** Not in MVP.
