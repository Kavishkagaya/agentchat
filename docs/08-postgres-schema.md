# Postgres Schema

This schema uses `group` as the canonical chat entity (`group == chat`).

## Core Identity

### `orgs`
- Workspace/org record.

### `users`
- User identity record.

### `org_members`
- Workspace membership and role.

## Group Domain

### `groups`
- Canonical group/chat record.
- Includes status (`active`, `idle`, `archived`) and canonical group config JSON.
- Includes activity/archive timestamps.

### `group_members`
- Group membership by user.

### `group_agents`
- Agent attachment list for a group.

## Runtime Routing

### `group_runtime`
- Control-plane routing/runtime record keyed by `group_id`.
- Stores `group_controller_id`, runtime status, activity timestamps, and region metadata.

### `agent_runtimes`, `group_agent_runtimes`
- Runtime tracking/association metadata for agent execution.

## Archive/Lifecycle

### `group_snapshots`
- Snapshot metadata for archived group state persisted to R2.

### `group_archives`
- Archive events referencing snapshot ids and R2 paths.

### `group_tasks`
- Lifecycle/background task tracking metadata.

## Configuration Ownership

Canonical config ownership is per workspace domain:
- `groups.config` for group runtime policy/config.
- `provider_catalog.config` for provider runtime configuration.
- `mcp_servers.config` for MCP server runtime configuration.

Dependent records should reference canonical records by id rather than duplicating full config payloads.

## Secrets

### `secrets`
- Workspace secret store keyed by `secret_id` (UUID).

### `group_secrets`
- Group-to-secret grants via `secret_id` reference.

### `provider_catalog.secret_ref`, `mcp_servers.secret_ref`
- Secret references to workspace secret ids.
- Secret values are resolved from the secret store at runtime (not inline in config payloads).

## Billing/Audit

### `org_usage`, `org_limits`, `subscriptions`
- Usage, limits, and billing/subscription metadata.

### `audit_log`
- Audit trail for workspace-level actions.
