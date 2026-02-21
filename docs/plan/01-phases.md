# Phases And Milestones

## Phase 0: Foundations

Scope:
1. Repo structure, CI, lint, formatting, and environment config.
2. Service skeletons for App API, Orchestrator, Chat Controller, and Agents Worker.
3. Postgres schema migration setup.
4. R2 bucket layout and naming conventions.

Exit Criteria:
1. Services build and run locally with stub handlers.
2. Automated CI runs lint and unit tests.
3. Database migrations apply cleanly in a dev environment.

## Phase 1: Core Chat And Agents

Scope:
1. Chat Controller Durable Object with SQLite state and message log.
2. App API endpoints for chats, messages, and membership.
3. Orchestrator routing and chat activation, including request forwarding to Chat Controller.
4. Agent execution via a shared Agents Worker using the Vercel AI SDK.
5. Fixed tool set including a configurable external HTTP tool (mutating requires approval).
6. Context assembly with summary plus recent window.

Exit Criteria:
1. Chat creation and message flow works end to end without sandbox.
2. Agent responses persist and broadcast correctly.
3. Orchestrator forwards chat requests and activates Chat Controller reliably.
4. External HTTP tools execute inside the worker with approval gating and return artifacts to chat.
5. Summary generation job runs and stores `summary_version` and `message_cursor`.

## Phase 2: Org, Secrets, And Billing

Scope:
1. Org and membership sync via Clerk webhooks.
2. Secrets management with org and chat grants.
3. Stripe billing integration with seat counting and usage counters.
4. Enforcement of org quotas at App API.

Exit Criteria:
1. Org creation and membership sync are reliable.
2. Secrets injection into agents works with grants.
3. Billing status gates agent usage in real time.

## Phase 3: Reliability And Operations

Scope:
1. Observability and audit trails.
2. Backup and restore from R2 with checksum validation.
3. Abuse and egress guardrails for external tools.

Exit Criteria:
1. Crash recovery restores chat state deterministically.
2. Audit logs are complete for security events.

## Phase 4: Product Polish

Scope:
1. UX improvements for progress streaming.
2. Agent marketplace UI and moderation pipeline.
3. Performance tuning and cost optimization.

Exit Criteria:
1. User-reported friction points are resolved.
2. System meets latency and stability targets.
3. Costs align with MVP budget assumptions.
