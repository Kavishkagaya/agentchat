# Worker Database

Shared schema and services for Cloudflare Worker environments, using the Neon serverless HTTP driver. The schema is imported and re-exported from `@axon/database`.

## Tech Stack

- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **Driver**: @neondatabase/serverless (HTTP)

## Key Files

| Path | Role |
|------|------|
| `src/schema/index.ts` | Re-exports schema from `@axon/database` |
| `src/client.ts` | DB client initialization |
| `src/services/chats.ts` | Chat runtime CRUD, archive recording, deletion |
| `src/services/secrets.ts` | Secret lookups |
| `src/services/model-catalog.ts` | Model catalog queries |
| `src/services/mcp-servers.ts` | MCP server queries |

## Schema Workflow

The schema is maintained in `packages/database`. Workers import it via `@axon/database/schema`.

1.  Make changes in `packages/database/src/schema/index.ts`.
2.  Run `pnpm db:push` in `packages/database`.
3.  Typecheck to ensure everything is in sync.

## Consumed By

- `apps/orchestrator` — chat runtime services
- `apps/agents` — agent config lookups, secret resolution
- `apps/memory-controller` — config lookups