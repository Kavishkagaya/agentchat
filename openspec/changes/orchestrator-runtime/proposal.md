## Why

The Orchestrator is described as the global control plane and already performs group activation, routing token issuance, and WebSocket proxying, but there is no spec that defines its runtime contract. As other services integrate (web app, group controller, agents worker), the lack of a formal contract increases the risk of mismatched request shapes, insecure auth flows, and inconsistent lifecycle behavior. A detailed proposal is needed now to lock down responsibilities and enable downstream specs without guesswork.

## What Changes

- Define a new **orchestrator-runtime** capability spec that documents the Orchestrator’s runtime responsibilities as the global control plane.
- Formalize the infra API surface:
  - `POST /infra/groups` (activate group): maps `group_id` to a deterministic Group Controller DO id, initializes group runtime routing state, and (optionally) warms the Group Controller without per-group session keys.
  - `POST /infra/routing-token` (issue routing token): issues a short-lived routing token for user access to a group.
  - `GET /groups/{group_id}/history` and `GET|WS /groups/{group_id}/ws` proxying behavior using routing tokens.
  - `POST /infra/cleanup` hook from Group Controller to Orchestrator for lifecycle cleanup callbacks.
  - Scheduled maintenance hooks (idle cleanup, long-idle archival triggers) as part of the Orchestrator runtime.
- Specify the security/auth contracts the Orchestrator owns:
  - App-signed requests to Orchestrator infra endpoints (no network trust).
  - Routing token format, claims, and TTL semantics for user access.
  - Validation requirements for routing token usage on proxy routes, and strict client → app → orchestrator → group controller chain (no skipped hops).
  - Group Controller–signed agent-access tokens for Agents Worker calls (static GC keypair, short-lived JWTs).
- Define group runtime record behavior in the database:
  - Required fields (`group_id`, `group_controller_id`, `status`, timestamps).
  - Update semantics on activation and on cleanup/idle transitions.
- Establish lifecycle and routing expectations:
  - Idempotency expectations for group activation and cleanup callbacks.
  - Error surface and failure modes the Orchestrator should expose (validation errors, init failures, auth errors).
  - Relationship to Group Controller and Agents Worker runtime contracts (no change to their specs, but explicit integration points).

## Capabilities

### New Capabilities
- `orchestrator-runtime`: Runtime contract for the Orchestrator as the global control plane, covering infra APIs, auth token issuance, routing behavior, and lifecycle hooks.

### Modified Capabilities
- (none)

## Impact

- `apps/orchestrator` worker runtime and API surface (routes, validation, lifecycle behavior)
- `apps/web` orchestrator client expectations and request contracts
- `packages/shared` auth utilities for service JWTs and routing tokens
- `packages/database` group runtime records and lifecycle status updates
- Group Controller initialization/cleanup interactions and routing expectations
- Architecture docs alignment (e.g., `docs/02-global-control-plane.md`)
