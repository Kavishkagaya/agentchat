# Orchestrator

Central gateway and lifecycle manager for the multi-agent chat system. Handles chat activation/archival/deletion, user authentication, routing token generation, and request forwarding to the Memory Controller Durable Object.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon serverless) via Drizzle ORM
- **Storage**: R2 buckets for chat archive snapshots
- **Auth**: Ed25519 signature-based tokens (3-tier: app → orchestrator → controller)

## Architecture

```
Client / Backend App
  → [router.ts] Thin route dispatch (URL matching, auth, response formatting)
  → [auth/] Auth guards (App Signature or Routing Token verification)
  → [services/] Business logic (chat lifecycle, token creation)
  → [do/] Memory Controller DO communication
  → [@axon/worker-database] Database operations (chat runtime CRUD)
  → Return response
```

## Key Files

| File | Role |
|------|------|
| `src/index.ts` | Worker entry point, exports fetch() and scheduled() handlers |
| `src/router.ts` | Thin route dispatch — URL matching, auth, call service, format response |
| `src/env.ts` | Environment type definitions |
| `src/services/chat.service.ts` | Business logic: activate, archive, destroy, cleanup, history, routing token |
| `src/services/errors.ts` | ServiceError class for typed business errors |
| `src/auth/infra-auth.ts` | Server-to-server auth guard (App Signature → AppInfraTokenPayload) |
| `src/auth/routing-auth.ts` | Client auth guard (Routing Token verification + configId match) |
| `src/do/controller-client.ts` | Memory Controller DO helpers: stub, headers, forwarding |
| `src/http/response.ts` | Response utilities: json(), errorResponse() |
| `src/http/request.ts` | Request parsing: readJson(), requireString(), getBearerToken() |

## Endpoints

### Server-to-Server (App Signature auth)

| Endpoint | Purpose |
|----------|---------|
| `POST /infra/chats` | Activate chat: create runtime + init Memory Controller DO |
| `POST /infra/routing-token` | Generate short-lived JWT for client WebSocket auth (5 min) |
| `POST /infra/chats/:id/archive` | Snapshot DO → store in R2 → mark archived |
| `DELETE /infra/chats/:id` | Destroy DO + cascade delete DB records |
| `POST /infra/chats/cleanup` | Update runtime statuses (active/idle/archived) |
| `GET /infra/chats/:id/history` | Fetch message history from Memory Controller |

### Client (Routing Token auth)

| Endpoint | Purpose |
|----------|---------|
| `POST /chats/:id/messages` | Send user message → forward to Memory Controller |
| `GET /chats/:id/history` | Get message history |
| `GET /chats/:id/ws` | WebSocket upgrade → forward to Memory Controller |

### Public

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check |
| `GET /dev/:id/*` | Dev-only: bypass auth, forward to Memory Controller |

## Auth Model

1. **App → Orchestrator**: App Signature Token (Ed25519, verified with `APP_PUBLIC_KEY`)
2. **User → Orchestrator**: Routing Token (signed JWT, created via `/infra/routing-token`, 5 min TTL)
3. **Orchestrator → Memory Controller**: Internal Token (per-request Ed25519 JWT)

## Layering Rules

- **Router** — HTTP concerns only. No DB calls, no DO communication. Calls auth guards, parses params, calls service, formats Response.
- **Services** — Business logic. Takes typed params, returns plain objects. Throws `ServiceError` for known errors. Does NOT import from `http/` or `auth/`.
- **Auth** — Guards return verified token payloads. Router extracts `org_id`/`user_id` from token, not from request body.
- **DO Client** — Encapsulates Memory Controller communication. Used by services only.
- **API types** — All request/response payload types live in `@axon/shared/src/chat-contract.ts`.

## Monorepo Dependencies

- `@axon/shared` — Token creation/verification, chat contract types, API payload types
- `@axon/worker-database` — DB client, chat runtime services (getChatRuntime, initializeChatRuntime, etc.)

## Dev

```bash
npm run dev        # wrangler dev on port 8789
npm run deploy     # wrangler deploy
npm run typecheck  # tsc --noEmit
```

## Key Environment Variables

- `ORCHESTRATOR_PRIVATE_KEY` / `ORCHESTRATOR_PUBLIC_KEY` — Sign/verify internal tokens
- `APP_PUBLIC_KEY` — Verify app signature tokens
- `GC_PUBLIC_KEY` — General crypto public key
- `NEON_DATABASE_URL` — PostgreSQL connection string
- `MEMORY_CONTROLLER` — Durable Object binding (to memory-controller worker)
- `ARCHIVES_BUCKET` / `TEMPLATES_BUCKET` — R2 bucket bindings

## Cron Triggers

- `*/5 * * * *` — Activity check (currently disabled)
- `0 3 * * *` — Auto-archive (currently disabled)
