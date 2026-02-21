# Postgres Schema (MVP)

This schema is designed for Neon Postgres and uses Clerk IDs as foreign keys for users and orgs.

## Core Tables

### orgs
- `org_id` text primary key (Clerk org id)
- `name` text
- `plan_id` text
- `created_at` timestamptz
- `updated_at` timestamptz

### org_members (cache via Clerk webhooks)
- `org_id` text
- `user_id` text (Clerk user id)
- `role` text
- `created_at` timestamptz
- primary key (`org_id`, `user_id`)

### chats
- `chat_id` text primary key
- `org_id` text
- `title` text
- `status` text (active, idle, archived)
- `is_private` boolean
- `agent_policy` jsonb (auto_trigger, multi_agent_enabled, max_agent_rounds, agent_cooldown_seconds)
- `created_by` text
- `created_at` timestamptz
- `updated_at` timestamptz
- `last_active_at` timestamptz

### chat_members
- `chat_id` text
- `user_id` text
- `role` text
- `added_by` text
- `created_at` timestamptz
- primary key (`chat_id`, `user_id`)

## Agents

### agents
- `agent_id` text primary key
- `org_id` text
- `name` text
- `role` text
- `system_prompt` text
- `model` text
- `tools` jsonb
- `visibility` text (public, private)
- `created_by` text
- `parent_agent_id` text null
- `enabled` boolean
- `created_at` timestamptz

### chat_agents
- `chat_id` text
- `agent_id` text
- `added_by` text
- `created_at` timestamptz
- primary key (`chat_id`, `agent_id`)

## Runtime Routing

### chat_runtime
- `chat_id` text primary key
- `chat_controller_id` text
- `chat_status` text
- `active_sandbox_count` integer
- `last_active_at` timestamptz
- `idle_at` timestamptz
- `region` text
- `updated_at` timestamptz

### sandboxes
- `sandbox_id` text primary key
- `chat_id` text
- `template_id` text
- `status` text
- `preview_host` text
- `sandbox_epoch` integer
- `last_heartbeat` timestamptz
- `created_at` timestamptz
- `updated_at` timestamptz
- `last_error` text

## Templates

### templates
- `template_id` text primary key
- `name` text
- `r2_path` text
- `version` text
- `cpu` numeric
- `memory_gb` numeric
- `disk_gb` numeric
- `sleep_after_seconds` integer
- `timeout_seconds` integer
- `exposed_ports` jsonb
- `created_at` timestamptz
- `updated_at` timestamptz

## Secrets

### secrets
- `secret_id` text primary key
- `org_id` text
- `name` text
- `namespace` text (sandbox, agent)
- `ciphertext` text
- `created_by` text
- `created_at` timestamptz
- `rotated_at` timestamptz

### chat_secrets
- `chat_id` text
- `secret_id` text
- `granted_by` text
- `created_at` timestamptz
- primary key (`chat_id`, `secret_id`)

## Usage and Billing

### org_usage
- `org_id` text
- `period_start` date
- `period_end` date
- `sandbox_minutes` integer
- `sandbox_egress_gb` numeric
- `concurrent_sandboxes_peak` integer
- primary key (`org_id`, `period_start`)

### org_limits
- `org_id` text primary key
- `max_sandbox_minutes` integer
- `max_concurrent_sandboxes_per_chat` integer
- `max_storage_gb` numeric
- `max_egress_gb` numeric

### subscriptions
- `org_id` text primary key
- `stripe_customer_id` text
- `stripe_subscription_id` text
- `status` text
- `current_period_end` timestamptz
- `created_at` timestamptz
- `updated_at` timestamptz

## Audit

### audit_log
- `audit_id` text primary key
- `org_id` text
- `actor_user_id` text
- `action` text
- `target_type` text
- `target_id` text
- `metadata` jsonb
- `created_at` timestamptz

## Snapshots

### chat_snapshots
- `snapshot_id` text primary key
- `chat_id` text
- `sandbox_id` text
- `r2_path` text
- `size_bytes` bigint
- `created_at` timestamptz
- `task_id` text

## Tasks

### chat_tasks
- `task_id` text primary key
- `chat_id` text
- `agent_id` text null
- `status` text
- `started_at` timestamptz
- `completed_at` timestamptz
- `canceled_at` timestamptz
- `reason` text
- `metadata` jsonb

## Archives

### chat_archives
- `chat_id` text primary key
- `r2_path` text
- `archived_at` timestamptz
- `reason` text
