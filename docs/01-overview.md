# Overview

## Executive Summary

The platform uses a strict runtime chain and split responsibilities:
- **App** is the only public client entrypoint.
- **Orchestrator** is the global control plane for activation, routing tokens, lifecycle, and archive orchestration.
- **Group Controller (Durable Object)** owns active group history/runtime state.
- **Agents Worker** is shared and stateless; it executes agent requests per call.

A group is the canonical long-lived chat unit (`group == chat`).

## Runtime Flow

1. Client connects to the app.
2. App calls Orchestrator infra APIs with an app-signed token.
3. Orchestrator activates/routs to deterministic Group Controller IDs from `group_id`.
4. App requests a short-lived routing token from Orchestrator.
5. App proxies runtime traffic through Orchestrator to Group Controller.
6. Group Controller calls Agents Worker per request using short-lived GC-signed agent-access tokens.

## Security Model

### Infra Authentication
- `POST /infra/groups`, `POST /infra/routing-token`, and lifecycle infra endpoints require app-signed auth.
- Auth failure returns an error and performs no state mutation.

### User Routing Tokens
- Orchestrator issues short-lived routing tokens with claims:
  - `user_id`
  - `group_id`
  - `role`
  - `exp`
- Proxy routes validate signature, expiry, and `group_id` match before upgrade/forward.

### Group Controller -> Agents Worker Auth
- Group Controller mints short-lived agent-access JWTs with static GC signing keys.
- Agents Worker verifies signature, expiry, scope, and group/agent claims.
- No persistent GC↔Worker socket is required; invocation is request-scoped.

## History And Archive

- `history_mode = "internal"`: history + compaction summary live in DO-local SQLite.
- `history_mode = "external"`: persistence can be delegated while routing/runtime behavior is preserved.
- R2 is used only during archive (manual or inactivity auto-archive), not for active history.
