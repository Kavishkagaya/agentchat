# Implementation Plan Index

This plan translates the architecture docs into an executable build plan with phases, workstreams, API contracts, data model checkpoints, risks, and release criteria.

## Goals

1. Ship a single-region MVP with reliable chat, agents, and sandbox execution.
2. Establish clear authority boundaries between Orchestrator, Chat Controller, and R2.
3. Provide a maintainable path to multi-region and marketplace expansion.

## Non-Goals (MVP)

1. Public API access for third parties.
2. Multi-region routing or global data residency controls.
3. Paid agent marketplace.

## Scope Map

1. Phase plan and milestones are in `01-phases.md`.
2. Workstreams and owners are in `02-workstreams.md`.
3. API contracts are in `03-api-contracts.md`.
4. Data model checkpoints are in `04-data-model.md`.
5. Risks and mitigations are in `05-risk-register.md`.
6. Testing and release criteria are in `06-testing-release.md`.

## Dependencies

1. Cloudflare Workers, Durable Objects, R2.
2. Cloudflare Sandbox SDK.
3. Neon Postgres.
4. Clerk for org and user identity.
5. Stripe for billing (MVP).

## Runtime Choices (MVP)

1. UI: Next.js.
2. App API: Next.js Route Handlers (assumption for MVP).
3. Orchestrator: Cloudflare Worker with Cron Triggers (no always-on server).
4. Agents: Node.js runtime service.
