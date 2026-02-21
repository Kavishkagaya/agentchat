# Workstreams

## App API And UI

Responsibilities:
1. Chat, membership, agent registry, and message endpoints.
2. Billing portal and plan gating.

Dependencies:
1. Clerk org and user identity.

Runtime:
1. Next.js app with Route Handlers for API (MVP assumption).

## Chat Controller (Durable Objects)

Responsibilities:
1. Authoritative chat state, SQLite persistence, summaries.
2. Message ordering and concurrency control.
3. External tool execution orchestration and artifact capture (approval-gated).
4. Invoke the shared Agents Worker for LLM responses (no per-agent workers).

Dependencies:
1. R2 for archive backup and restore.

## Agents Worker

Responsibilities:
1. Model invocation and streaming response assembly.
2. Fixed tool registry and execution, including configurable external HTTP calls.
3. Provider error handling and retries.

Dependencies:
1. Provider API keys and env profiles.

## Orchestrator (Control Plane)

Responsibilities:
1. Chat routing map and activation state.
2. Forward chat requests to the correct Chat Controller.
3. Coordinate lifecycle events (idle/archive triggers) with Chat Controller.

Dependencies:
1. Postgres for routing and chat runtime records.
2. Chat Controller for lifecycle callbacks.

Runtime:
1. Cloudflare Worker for APIs with Cron Triggers for global sweeps.

## Data And Storage

Responsibilities:
1. Postgres schema migrations and data integrity.
2. R2 layout for templates and archives.
3. Retention policies and cleanup.

Dependencies:
1. Chat Controller for archival exports.

## Security And Compliance

Responsibilities:
1. Secret encryption and grants.
2. Audit log coverage for admin actions.
3. Abuse controls and egress limits for external tools.

Dependencies:
1. App API for role and permission checks.
2. Agents Worker for enforcement at runtime.

## Observability And Operations

Responsibilities:
1. Logs, metrics, and tracing.
2. Alerting for crash loops and quota spikes.
3. Runbooks for incident response.

Dependencies:
1. All services emit structured logs.
2. Central log storage in R2.
