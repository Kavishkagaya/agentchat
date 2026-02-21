# Data Model Checkpoints

## Postgres (MVP)

1. Core tables: orgs, org_members, chats, chat_members.
2. Agent tables: agents, chat_agents.
3. Runtime tables: chat_runtime, sandboxes.
4. Usage tables: org_usage, org_limits, subscriptions.
5. Audit tables: audit_log.
6. Archive tables: chat_archives, chat_snapshots, chat_tasks.

## R2 Layout

1. Templates: `templates/{template_id}/{version}/...`.
2. Chat archives: `archives/{chat_id}/{snapshot_id}/...`.
3. Sandbox snapshots: `snapshots/{chat_id}/{sandbox_id}/{task_id}/...`.

## Invariants

1. A chat in `archived` status must have zero running sandboxes and no preview tokens issued.
2. `active_sandbox_count` equals the count of sandboxes in running or starting status for the chat.
3. `sandbox_epoch` increments on stop or destroy and is checked at gateway for token revocation.
4. Chat Controller must restore from R2 before accepting new messages if a chat is archived.

## Migration Checkpoints

1. After Phase 1, message and summary metadata are stored in SQLite only.
2. After Phase 2, runtime routing tables are live and updated by Orchestrator.
3. After Phase 3, billing and usage tables are enforced for sandbox creation.
