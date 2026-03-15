# Database

Source-of-truth database package. Hand-written Drizzle ORM schema and service functions for the shared Neon PostgreSQL database.

## Tech Stack

- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **Driver**: postgres.js

## Key Files

| Path | Role |
|------|------|
| `src/schema/index.ts` | Hand-written schema (authoritative source of truth) |
| `src/client.ts` | DB client initialization |
| `src/services/chats.ts` | Chat CRUD, lifecycle, deletion |
| `src/services/agents.ts` | Agent CRUD |
| `src/services/auth.ts` | Membership and permission checks |
| `src/services/secrets.ts` | Encrypted secret management |
| `src/services/mcp-servers.ts` | MCP server CRUD |
| `src/services/model-catalog.ts` | Model catalog management |
| `src/services/audit.ts` | Audit log |
| `src/services/system-config.ts` | System config key-value store |
| `src/crypto/secrets.ts` | Encryption/decryption helpers |

## DB Commands

```bash
pnpm db:push       # Apply schema changes directly to Neon
pnpm db:generate   # Generate migration files from schema diff
pnpm db:migrate    # Run pending migrations
pnpm db:studio     # Open Drizzle Studio (web UI)
```

## Schema Change Workflow

1. Edit `src/schema/index.ts`
2. Run `pnpm db:push` to apply to Neon
3. Then run `pnpm db:pull` in `packages/worker-database` to sync the auto-generated schema

## Consumed By

- `apps/web` — tRPC routers use service functions directly
- `apps/orchestrator` — imports for auth and chat services
