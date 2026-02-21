# Workstreams

## App API And UI

Responsibilities:
1. Chat, membership, agent registry, and message endpoints.
2. Approval flow and UI state for sandboxes and previews.
3. Billing portal and plan gating.

Dependencies:
1. Orchestrator endpoints for lifecycle and preview tokens.
2. Clerk org and user identity.

Runtime:
1. Next.js app with Route Handlers for API (MVP assumption).

## Chat Controller (Durable Objects)

Responsibilities:
1. Authoritative chat state, SQLite persistence, summaries.
2. Message ordering and concurrency control.
3. Tool execution orchestration and artifact capture.

Dependencies:
1. Orchestrator for sandbox lifecycle.
2. R2 for archive backup and restore.

## Orchestrator (Infra Control Plane)

Responsibilities:
1. Sandbox lifecycle management and routing state.
2. Usage metering and quota enforcement.
3. Preview token issuance and revocation via `sandbox_epoch`.

Dependencies:
1. Postgres for routing and usage records.
2. Sandbox runtime provider.

Runtime:
1. Cloudflare Worker for APIs with Cron Triggers for global sweeps.

## Gateway (Preview Proxy)

Responsibilities:
1. JWT validation and preview routing.
2. WebSocket passthrough for dev servers.
3. Rate limiting per sandbox.

Dependencies:
1. Orchestrator for token format and claims.
2. Postgres routing records.

Runtime:
1. Cloudflare Worker.

## Data And Storage

Responsibilities:
1. Postgres schema migrations and data integrity.
2. R2 layout for templates and archives.
3. Retention policies and cleanup.

Dependencies:
1. Orchestrator for routing and usage writes.
2. Chat Controller for archival exports.

## Security And Compliance

Responsibilities:
1. Secret encryption and grants.
2. Audit log coverage for admin actions.
3. Abuse controls and egress limits.

Dependencies:
1. App API for role and permission checks.
2. Orchestrator for enforcement at runtime.

## Observability And Operations

Responsibilities:
1. Logs, metrics, and tracing.
2. Alerting for crash loops and quota spikes.
3. Runbooks for incident response.

Dependencies:
1. All services emit structured logs.
2. Central log storage in R2.
