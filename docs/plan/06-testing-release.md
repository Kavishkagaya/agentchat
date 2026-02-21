# Testing And Release Criteria

## Testing Strategy

1. Unit tests for Chat Controller state transitions and message ordering.
2. Integration tests for Agents Worker execution and external tool approvals.
3. Integration tests for Orchestrator routing and forwarding.
4. Contract tests for App API and Agents Worker RPC.
5. Chaos tests for archive, restore, and retry behavior.

## Release Gates

1. All critical paths have automated tests and pass in CI.
2. Observability dashboards track errors and latency.
3. Rollback plan exists for schema and service deploys.
4. Security checks cover secrets access and audit logging.

## Manual Verification Checklist

1. Create chat, send messages, verify agent response ordering.
2. Trigger an external tool, verify approval gating and response stream.
3. Verify Orchestrator routing via `GET /infra/chats/{chat_id}/route`.
4. Archive chat, verify R2 snapshot and local wipe.
5. Rehydrate archived chat, verify context restoration.
