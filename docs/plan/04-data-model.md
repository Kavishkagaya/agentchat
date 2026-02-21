# Data Model Checkpoints

## Postgres (MVP)

1. Core tables: orgs, org_members, chats, chat_members.
2. Agent tables: agents, chat_agents.
3. Runtime tables: chat_runtime (routing and activation state), agent_runtimes, chat_agent_runtimes.
4. Usage tables: org_usage, org_limits, subscriptions.
5. Audit tables: audit_log.
6. Archive tables: chat_archives, chat_snapshots, chat_tasks.

## R2 Layout

1. Chat archives: `archives/{chat_id}/{snapshot_id}/...`.
2. Chat snapshots: `snapshots/{chat_id}/{snapshot_id}/...`.

## Invariants

1. A chat in `archived` status must not accept new messages until restore completes.
2. Chat Controller must restore from R2 before accepting new messages if a chat is archived.

## Migration Checkpoints

1. After Phase 1, message and summary metadata are stored in SQLite only.
2. After Phase 2, org and membership records are live in Postgres.
3. After Phase 3, backup and restore flows are verified in R2.
