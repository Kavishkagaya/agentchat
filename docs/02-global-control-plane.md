# Global Control Plane (MVP, Single Region)

The Global Control Plane is the always-on layer that owns identity, routing, and lifecycle for all chat clusters. It is not a chat cluster itself.

## Core Responsibilities

- **Session Orchestrator:** Creates and destroys per-chat clusters, assigns the current runtime endpoint, and manages chat lifecycle state.
- **Chat Controller Identity:** Deterministic Durable Object ID derived from `chat_id` (stable across hibernation and crashes).
- **Lifecycle Ownership:** The Orchestrator owns create/delete/idle cleanup. The Chat Controller requests lifecycle changes via the infra API.
- **Global Routing Map:** Stable addressing via `chat_id`. The routing record maps `chat_id` to the Chat Controller and current runtime status.
- **Identity & Invites:** Uses **Clerk Organizations** as workspaces. Users join an org, then chats live inside the org. Chat membership is stored in the platform database.
- **Billing & Quotas:** Seat-based billing (per org member). Enforce basic limits before cluster creation.
- **Template Registry:** Stores sandbox templates and versions.
- **Chat Metadata DB:** Stores chat records, membership, and permissions. No global memory layer in MVP.
- **Secrets Management:** Stores user or org secrets and injects them into a chat cluster when authorized.
- **Observability:** Central logs, lifecycle events, and cost counters for each chat.
- **Policy Engine:** MVP can be a stub that enforces a small set of rate limits and abuse checks.
- **Authority Boundaries:** Orchestrator is authoritative for infra state (sandboxes, routing records). Chat Controller is authoritative for in-chat state (messages, summaries, local task state). R2 is authoritative for archived snapshots. When these disagree, infra state follows Orchestrator, chat state follows Chat Controller, and archived state follows R2.

## Service Layout (MVP)

- **Split Services:** Orchestrator (infra), gateway, and app/billing are separate services for clearer isolation and scaling.
- **Scheduler Model:** Global background jobs run via Cloudflare Cron Triggers. Per-chat timers are handled by Durable Object alarms.
- **Agents Worker:** Single shared stateless service for LLM reasoning. Agent configs and secrets are fetched on demand (cached) and never stored as authoritative state in the worker.

### App vs Infra Responsibilities (MVP)

- **App Layer (UI/API):** Stripe subscriptions, seat counting, billing portal, plan limits stored in Postgres.
- **Infra Layer (Orchestrator/Policy):** Real-time quota enforcement, usage counters, and hard blocks at sandbox creation time.

## Global Routing & Preview (MVP)

- **Stable Chat URL:** `app.com/c/{chat_id}`.
- **Preview URLs:** Issued by the orchestrator and short-lived. The Chat Controller can request additional preview URLs as needed.
- **Sandbox Down Behavior:** The UI returns a "start sandbox" message to the user instead of auto-starting.
- **Routing Storage:** Neon Postgres (authoritative routing map).
- **Sandbox Runtime Records:** Separate table keyed by `sandbox_id` with `chat_id`, `status`, `preview_host`, `last_heartbeat`, and `template_id`.
- **Routing Record Fields:** `chat_id`, `chat_controller_id`, `chat_status`, `active_sandbox_count`, `last_active`, `idle_at`, `region`.

### Gateway & Preview (MVP)

- **Preview URL Shape:** `app.com/c/{chat_id}/preview/{sandbox_id}`.
- **Token TTL:** Short-lived (default 5 minutes).
- **WebSocket Handling:** Full passthrough for HMR and dev servers.
- **Auth Check:** Token validation at gateway. Token includes `sandbox_epoch` to allow revocation by bumping the epoch in `sandboxes`.
- **Rate Limits:** Enforced per sandbox at the gateway.

### Gateway Internals (MVP)

- **Token Format:** JWT signed by Orchestrator.
- **Routing Lookup:** Short-lived in-memory cache by `sandbox_id`, fallback DB lookup on miss.
- **Cache Layer:** In-memory cache per gateway instance (short TTL).
- **Cache Miss Behavior:** Return error (sandbox not running). User must re-trigger via agent.
- **WS Proxy:** Raw passthrough (no payload shaping).
- **Rate Limit Scope:** Per sandbox only (no per-IP limits in MVP).
- **JWT Claims:** `sub` (user_id), `org_id`, `chat_id`, `sandbox_id`, `sandbox_epoch`, `iat`, `exp`.

## Access Model (MVP)

- **Workspace:** Clerk Organization.
- **Chat:** Entity inside a workspace.
- **Membership:** Default is workspace-wide access for new chats, with an optional "private" flag and explicit chat members.
- **Permission Checks:** Enforced in API layer, preview access, and WebSocket connect.
- **Auth:** Required for all access. Invites are org membership (no guest access in MVP).

## Billing & Quotas (MVP)

- **Payments:** Real billing in MVP via Stripe.
- **Billing Unit:** Seat-based (per org member).
- **Limits:** Org-wide only. Initial limits are max concurrent sandboxes per chat and max sandbox minutes per org.
- **Usage Model:** Wall-clock sandbox minutes. Reset on monthly billing cycle. Hard blocks only (no soft warnings).
- **Metering Window:** Count from first sandbox operation until sleep or destroy. Sleeping resets the container.
- **Aggregation:** Orchestrator keeps in-memory counters for real-time enforcement and periodically flushes to Postgres for billing and reporting.

## Template Registry (MVP)

- **Scope:** Sandbox templates only.
- **Storage:** R2 (filesystem templates).
- **Versioning:** Supported via directory versions.
- **Metadata:** Includes resource limits and defaults (`cpu`, `memory`, `disk`, `sleepAfter`, `timeout`, `exposedPorts`).
- **Default Templates:** `react-vite`, `node`, `python`.

## Chat Metadata (MVP)

- **Database:** Neon Postgres.
- **Scope:** Chat records, membership, permissions, and basic filters.
- **Search:** Simple filtering on the chats table (no full-text or cross-chat memory).

## Secrets & Env Profiles (MVP)

- **Org Secrets Store:** Encrypted secrets scoped to orgs (BYOK).
- **Chat Grants:** Explicit mapping of which org secrets are allowed for a chat.
- **Agent Secrets:** Separate namespace for agent/LLM secrets.
- **Agent Secret Access:** Org-wide by default (MVP), not per chat.
- **Env Profiles:** Distinct injection targets for Sandbox vs Agent runtime.

## Observability & Audit (MVP)

- **Logs:** Errors and lifecycle events only.
- **Log Storage:** Cloudflare Logpush to R2 (cost-effective).
- **Usage Tracking:** Per-org usage metrics in Neon Postgres.
- **Audit Trails:** Required for org actions (invites, role changes, secrets).

## Policy Engine (MVP)

- **Enforcement:** Hard blocks only.
- **Rules:** Cost-based limits that map to Cloudflare billing drivers (sandbox minutes, concurrent sandboxes, storage/egress as needed).
- **Abuse Flags:** Manual org-level blocklist to suspend abuse quickly.
- **Egress Guardrails:** Limit outbound transfer per sandbox/org to prevent abuse even if direct egress fees are low.

## Infra Manager API (MVP)

- **Exposure:** Internal only. External access is via UI or chat API.
- **Endpoints:** Create chat, get chat, get preview token, start sandbox, stop sandbox.
- **Lifecycle:** Async infra provisioning. Agent message handling remains synchronous with streaming responses.

### Infra Workflows (MVP)

**Create Chat**
- Create `chats` record and `chat_members`.
- Attach agents to chat (from org defaults or explicit selections).
- Create `chat_runtime` row with `status = idle`.
- Do not prewarm Chat Controller or Agents Worker per chat. First message activates the Chat Controller; Agents Worker is shared and stateless.

**Start Sandbox**
- Orchestrator enforces quota/policy checks before provisioning.
- On quota failure, return policy error to the Chat Controller.
- Sandbox reuse decisions are handled by the Chat Controller (not the Orchestrator).
- Sandbox creation is only requested after user approval (reuse existing or create new).
 - All create/start/stop requests include an idempotency key. Orchestrator must return the same sandbox_id for retries with the same key.

**Stop Sandbox / Idle Cleanup**
- Chat Controller detects idle and calls `release_resources`.
- Orchestrator updates sandbox status immediately to prevent new traffic.
- Preview tokens are revoked on stop.

**Long-Idle Archive (e.g., 7 days)**
- Orchestrator detects long-idle chats from `last_active`.
- Orchestrator requests the Chat Controller to export chat state to R2.
- Orchestrator tears down all infra (sandboxes, runtime records) and marks chat as archived.
- Chat Controller wipes local state after successful export. Rehydration occurs from R2 on next access.
 - Export requests are idempotent; Orchestrator retries on timeout and treats duplicate exports as success if the same R2 path and checksum match.

**Delete Chat**
- Hard delete chat records and related resources.
- Retain audit logs.
- Terminate all sandboxes immediately.

### Chat Controller RPC (MVP)

- `request_sandbox(template_id, resources, env_profile)`
- `stop_sandbox(sandbox_id)`
- `release_resources(chat_id)`
- `request_preview_token(sandbox_id)`
- `report_sandbox_heartbeat(sandbox_id)`
- `report_usage(chat_id, sandbox_id, seconds, egress_gb)`
 - All RPCs that create or mutate infra accept an `idempotency_key`.

Quota checks are enforced in the Orchestrator on resource requests. Usage reports flow through the Orchestrator, which can delegate to an internal usage/quota service.

## Upgrade & Migration (MVP)

- **Template Selection:** Store template IDs and use the latest available version (no pinning in MVP).
- **Database Migrations:** Manual migrations for chat metadata schema.
- **Sandbox Images:** Manual rebuilds on template changes; no auto-rebuild pipeline in MVP.

## Abuse & Recovery (MVP)

- **Sandbox Limits:** Enforce caps on concurrent sandboxes, sandbox minutes, and compute intensity per org/chat.
- **Payment Failures:** Downgrade orgs to free plan on failed payments (no hard delete).
- **Crash Loops:** Exponential backoff on repeated sandbox restarts.

## External Product Interface (MVP)

- **Surface:** UI only.
- **Public API:** Not in MVP.
