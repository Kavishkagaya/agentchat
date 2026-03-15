# Worker Database

Auto-generated schema reflection of the shared Neon PostgreSQL database, for Cloudflare Worker environments using the Neon serverless HTTP driver.

## Tech Stack

- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **Driver**: @neondatabase/serverless (HTTP)

## Key Files

| Path | Role |
|------|------|
| `src/schema/schema.ts` | Auto-generated table definitions (DO NOT hand-edit) |
| `src/schema/relations.ts` | Auto-generated relation definitions (DO NOT hand-edit) |
| `src/client.ts` | DB client initialization |
| `src/services/chats.ts` | Chat runtime CRUD, archive recording, deletion |
| `src/services/secrets.ts` | Secret lookups |
| `src/services/model-catalog.ts` | Model catalog queries |
| `src/services/mcp-servers.ts` | MCP server queries |

## DB Commands

```bash
pnpm db:pull    # Pull latest schema from Neon (regenerates src/schema/)
```

## Schema Sync Workflow

Schema files are auto-generated — never edit them by hand. To update:
1. Make changes in `packages/database/src/schema/index.ts`
2. Run `pnpm db:push` in `packages/database`
3. Run `pnpm db:pull` here to regenerate `src/schema/`

## Consumed By

- `apps/orchestrator` — chat runtime services
- `apps/agents` — agent config lookups, secret resolution
- `apps/memory-controller` — config lookups
