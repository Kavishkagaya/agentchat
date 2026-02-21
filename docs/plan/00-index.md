# Implementation Plan Index

This plan translates the architecture docs into an executable build plan with phases, workstreams, API contracts, data model checkpoints, risks, and release criteria.

## Goals

1. Ship a single-region MVP with reliable chat and agents via a shared worker (no sandbox).
2. Establish clear authority boundaries between Orchestrator, App API, Chat Controller, and R2.
3. Provide a maintainable path to future sandbox execution and marketplace expansion.

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
2. Vercel AI SDK (model provider integration).
3. Neon Postgres.
4. Clerk for org and user identity.
5. Stripe for billing (MVP).

## Runtime Choices (MVP)

1. UI: Next.js.
2. App API: Next.js Route Handlers (assumption for MVP).
3. Orchestrator: Cloudflare Worker for chat routing and lifecycle coordination.
4. Agents: Single shared Node.js runtime service (stateless) with in-memory cache for agent configs and secrets.
