# Phases And Milestones

## Phase 0: Foundations

Scope:
1. Repo structure, CI, lint, formatting, and environment config.
2. Service skeletons for App API, Orchestrator, Gateway, and Chat Controller.
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
3. Agent execution via Vercel AI SDK with tool registry integration.
4. Context assembly with summary plus recent window.

Exit Criteria:
1. Chat creation and message flow works end to end without sandbox.
2. Agent responses persist and broadcast correctly.
3. Summary generation job runs and stores `summary_version` and `message_cursor`.

## Phase 2: Sandbox Execution And Preview

Scope:
1. Orchestrator endpoints for sandbox lifecycle and preview token issuance.
2. Sandbox provisioning and template registry integration.
3. Gateway worker for preview proxying and WebSocket passthrough.
4. User approval flow for sandbox creation or reuse.
5. Cron sweeps for idle cleanup, archive detection, and usage flush.

Exit Criteria:
1. Sandbox lifecycle works with idempotent create and stop.
2. Preview URLs function through the gateway and respect token revocation.
3. Tool execution runs in sandbox and returns artifacts to chat.

## Phase 3: Org, Secrets, And Billing

Scope:
1. Org and membership sync via Clerk webhooks.
2. Secrets management with org and chat grants.
3. Stripe billing integration with seat counting and usage counters.
4. Enforcement of org quotas at Orchestrator.

Exit Criteria:
1. Org creation and membership sync are reliable.
2. Secrets injection into sandboxes and agents works with grants.
3. Billing status gates sandbox creation in real time.

## Phase 4: Reliability And Operations

Scope:
1. Observability and audit trails.
2. Reaper for idle sandbox cleanup and long-idle archive flow.
3. Backup and restore from R2 with checksum validation.
4. Abuse and egress guardrails.

Exit Criteria:
1. Idle and long-idle cleanup are stable and tested.
2. Crash recovery restores chat state deterministically.
3. Audit logs are complete for security events.

## Phase 5: Product Polish

Scope:
1. UX improvements for approval flow and progress streaming.
2. Agent marketplace UI and moderation pipeline.
3. Performance tuning and cost optimization.

Exit Criteria:
1. User-reported friction points are resolved.
2. System meets latency and stability targets.
3. Costs align with MVP budget assumptions.
