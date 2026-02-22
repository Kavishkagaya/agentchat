# API Contracts (MVP Draft)

This is a minimal contract draft to align teams. Exact schemas should live in OpenAPI once implementation starts.

## App API

1. `POST /groups`
Request: org_id, title, is_private, agent_ids.
Response: group_id, status, created_at.

2. `GET /groups/{group_id}`
Request: auth context.
Response: group record, members, agents, status.

3. `POST /groups/{group_id}/token`
Request: auth context.
Response: routing_token.

4. `POST /groups/{group_id}/archive`
Request: reason.
Response: archived_at, r2_path.

## Orchestrator API (Internal)



### Authentication: Chain of Trust & Routing Tokens

*   **App -> Orchestrator:** Asymmetric Key (App signs request).

*   **User -> Orchestrator (WebSocket/Message):** Stateless Routing Token (Signed by Orchestrator).

*   **Group Controller -> Agents Worker:** Session Certificate.



1.  `POST /infra/groups`

    *   **Purpose:** Initialize a Group Session.

    *   **Request:** `group_id`, `org_id`, `user_id` (Auth: App Signed).

    *   **Response:** 

        *   `group_controller_id`

        *   `session_private_key` (Ephemeral)

        *   `session_certificate` (Signed by Orchestrator)



2.  `POST /infra/routing-token`

    *   **Purpose:** Issue a short-lived stateless token for client access (Messaging/WebSocket).

    *   **Request:** `group_id`, `user_id` (Auth: App Signed / Bearer Token checked against DB).

    *   **Response:** `routing_token` (JWT signed by Orchestrator).



3.  `GET /groups/{group_id}/ws` (WebSocket)

    *   **Query Param:** `?token={routing_token}`

    *   **Behavior:** Authenticates token statelessly, upgrades connection, and proxies to Group Controller DO.



4.  `POST /infra/cleanup`

    *   **Purpose:** Lifecycle callback from Group Controller.

    *   **Request:** `group_id`, `reason` (Auth: Signed with `session_private_key`).

    *   **Response:** `status`.



## Agents Worker API (Internal)



1.  `POST /agents/run`

    *   **Headers:**

        *   `X-Session-Cert`: The Session Certificate (from Orchestrator).

        *   `Authorization`: Request signature (using `session_private_key`).

    *   **Request:** `agent_id`, `messages`, `context`.

    *   **Response:** Stream of `AgentRunResult`.



2.  `POST /agents/run-stream`

    *   **Headers:** Same as above.

    *   **Request:** `agent_id`, `messages`, `context`.

    *   **Response:** Server-Sent Events (SSE).


