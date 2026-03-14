# Web Dashboard

Next.js web application serving as the user-facing dashboard for the Axon agentic chat platform. Manages agents, chats, models, secrets, and MCP servers with real-time chat via WebSocket.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: React 19 + Radix UI (Shadcn) + Tailwind CSS
- **API Layer**: tRPC 10 with TanStack React Query
- **Auth**: Clerk (OAuth/email)
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **State**: Zustand (client state)
- **Real-time**: WebSocket (browser native → orchestrator)

## Architecture

```
Browser
  → Next.js App Router (app/)
  → tRPC client (React Query hooks)
  → /api/trpc/[trpc] (server)
  → tRPC routers (server/trpc/routers/)
      ├─ @axon/database (direct DB queries)
      └─ orchestrator.ts (HTTP client → Orchestrator service)

Chat real-time:
  → chats.getToken → routing token
  → WebSocket → ws://orchestrator/chats/:id/ws?token=...
  → Events: user_message_stored, agent_start, text_delta, agent_message, done
```

## Key Directories

| Path | Role |
|------|------|
| `app/` | Next.js App Router pages and layouts |
| `app/dashboard/` | Protected dashboard (requires Clerk auth + org) |
| `app/dashboard/chats/[id]/` | Chat interface with WebSocket streaming |
| `app/dashboard/agents/` | Agent CRUD (create, edit, publish, copy from public) |
| `app/dashboard/models/` | LLM model catalog management |
| `app/dashboard/secrets/` | Encrypted API key management |
| `app/dashboard/mcps/` | MCP server management and tool discovery |
| `server/trpc/routers/` | tRPC router definitions (chats, agents, models, secrets, mcp, user) |
| `server/workers/orchestrator.ts` | HTTP client for Orchestrator service |
| `components/ui/` | Shadcn/Radix UI components |
| `app/store/` | Zustand stores |
| `app/providers/` | Auth sync provider (Clerk → Axon DB) |

## tRPC Routers

| Router | Key Procedures |
|--------|---------------|
| `chats` | list, create (+ activate infra), get, getToken, getHistory, update, delete |
| `agents` | list, create, update, publish, copyFromPublic |
| `models` | getCatalog, updateCatalog, list, create, update, delete |
| `secrets` | list, create, update, delete, reveal |
| `mcp` | add, update, delete, listTools, previewTools, refresh |
| `user` | me |
| `superAdmin` | listAllGroups |

## Auth Middleware Stack

1. `publicProcedure` — No auth
2. `protectedProcedure` — Requires Clerk user
3. `orgProcedure` — Requires user + org membership
4. `orgAdminProcedure` — Requires org admin role
5. `superAdminProcedure` — Requires system super-admin flag

## Monorepo Dependencies

- `@axon/database` — DB queries, schema models, service functions (chats, agents, secrets, etc.)
- `@axon/shared` — Types, validation schemas, token creation, config builders

## Dev

```bash
npm run dev        # next dev (port 3000)
npm run build      # next build
npm run start      # next start
npm run typecheck  # tsc --noEmit
```

## Key Environment Variables

- `ORCHESTRATOR_URL` — Orchestrator service URL (default: http://localhost:8789)
- `APP_PRIVATE_KEY` — Sign infra tokens for orchestrator calls
- `DATABASE_URL` — PostgreSQL connection string
- `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk auth
- `NEXT_PUBLIC_ORCHESTRATOR_URL` — Client-side orchestrator URL (WebSocket)
