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
Request: message text, agent_policy.
Response: message_id, status, streaming channel id.

4. `POST /chats/{chat_id}/archive`
Request: reason.
Response: archived_at, r2_path.

## Orchestrator API (Internal)

1. `GET /infra/chats/{chat_id}/route`
Request: auth context.
Response: chat_controller_id, status, last_active.

2. `POST /infra/chats/{chat_id}/messages`
Request: message text, agent_policy, auth context.
Response: message_id, status, streaming channel id.

3. `POST /infra/chats/{chat_id}/activate`
Request: auth context, idempotency_key.
Response: chat_controller_id, status.

## Agents Worker RPC (Internal)

1. `run_agent(agent_id, messages, env_profile)`
2. `run_tool(tool_id, args, context)`
