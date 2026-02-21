# API Contracts (MVP Draft)

This is a minimal contract draft to align teams. Exact schemas should live in OpenAPI once implementation starts.

## App API

1. `POST /chats`
Request: org_id, title, is_private, agent_ids.
Response: chat_id, status, created_at.

2. `GET /chats/{chat_id}`
Request: auth context.
Response: chat record, members, agents, status.

3. `POST /chats/{chat_id}/messages`
Request: message text, agent_policy, optional tool intent.
Response: message_id, status, streaming channel id.

4. `POST /chats/{chat_id}/approve-sandbox`
Request: decision reuse or new, template_id optional.
Response: sandbox_id, preview_url, status.

5. `POST /chats/{chat_id}/archive`
Request: reason.
Response: archived_at, r2_path.

## Orchestrator API (Internal)

1. `POST /infra/sandboxes`
Request: chat_id, template_id, resources, env_profile, idempotency_key.
Response: sandbox_id, status, preview_host.

2. `POST /infra/sandboxes/{sandbox_id}/stop`
Request: idempotency_key.
Response: status.

3. `POST /infra/preview-token`
Request: sandbox_id, user_id, org_id.
Response: jwt_token, expires_at.

4. `POST /infra/usage`
Request: chat_id, sandbox_id, seconds, egress_gb.
Response: accepted true or false.

## Chat Controller RPC

1. `request_sandbox(template_id, resources, env_profile, idempotency_key)`
2. `stop_sandbox(sandbox_id, idempotency_key)`
3. `release_resources(chat_id, idempotency_key)`
4. `request_preview_token(sandbox_id)`
5. `report_sandbox_heartbeat(sandbox_id)`
6. `report_usage(chat_id, sandbox_id, seconds, egress_gb)`
