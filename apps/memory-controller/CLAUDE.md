# Memory Controller — Implementation Guide

## Architecture

Cloudflare Durable Object service that manages conversation history, message routing, and agent orchestration for multi-agent chats using **Drizzle ORM** + **SQLite**.

```
Request → MemoryController (index.ts)
  ↓
  ├→ ChatHandler (chat/handler.ts)
  │   ├→ ContextManager (context-manager.ts)
  │   ├→ Message CRUD + Agent invocation
  │   └→ WebSocket broadcasting
  │
  └→ WorkflowHandler (workflow/handler.ts) [stub: 501]
```

## Database

**Type-safe schema** in `src/schema.ts` using Drizzle:
```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  message_id: text("message_id").primaryKey(),
  role: text("role").notNull(),
  // ...
});

export type MessageInsert = typeof messages.$inferInsert;
export type MessageSelect = typeof messages.$inferSelect;
```

**Migrations** are generated from schema:
```bash
npm run db:generate  # Creates drizzle/migrations/ files
```

Migration files are bundled and applied via:
```ts
const { migrate } = await import("drizzle-orm/durable-sqlite/migrator");
const config = await import("../../drizzle/migrations");
migrate(this.db, config.default);  // Synchronous in DO context
```

## Key Rules

### 1. All Queries Are Synchronous in DO Context

```ts
// ✅ Correct — .run() is synchronous
this.db.insert(schema.messages).values({...}).run();
this.db.select().from(schema.messages).all();

// ❌ Wrong — would hang
await this.db.insert(schema.messages).values({...}).run();
```

Durable Object SQLite is synchronous. Never use async Drizzle patterns here.

### 2. Database Initialization

Each ChatHandler instance initializes Drizzle once:
```ts
export class ChatHandler {
  private db: DrizzleSqliteDODatabase<typeof schema>;
  private contextManager: ContextManager;

  constructor(private ctx: DurableObjectState, private env: Env) {
    this.db = drizzle(ctx.storage, { schema });
    this.contextManager = new ContextManager(this.db);
  }
}
```

Never pass raw `sql` or `this.ctx.storage.sql` around. Always use the typed `db` instance.

### 3. Type Safety

```ts
// ✅ Correct — inferred types
const msgs = this.db.select().from(schema.messages).all();  // MessageSelect[]

// ❌ Wrong — manual casting defeats the point
const msgs = Array.from(
  this.ctx.storage.sql.exec("SELECT ...")
) as MessageSelect[];  // Type cast, no safety
```

Never bypass Drizzle's type system. Use schema types everywhere.

### 4. SQL Injection Prevention

**Dynamic table names must be whitelisted:**
```ts
import { ALLOWED_TABLES, type AllowedTable } from "./schema";

const tableNames = allNames.filter((n): n is AllowedTable =>
  (ALLOWED_TABLES as readonly string[]).includes(n)
);

for (const tableName of tableNames) {
  db.all(sql`SELECT * FROM ${sql.identifier(tableName)}`);  // Safe
}
```

**NEVER interpolate user input into SQL:**
```ts
// ❌ SQL Injection vulnerability
db.all(sql`SELECT * FROM ${userTableName}`);  // WRONG

// ✅ Correct — whitelisted + identifier()
db.all(sql`SELECT * FROM ${sql.identifier(whitelistedTableName)}`);
```

### 5. Atomic Storage Operations

All storage writes must be atomic:
```ts
// ✅ Atomic — single put() call
await this.ctx.storage.put({
  config_id: id,
  type: "chat",
  config: config,
});

// ❌ Prone to partial failure
await this.ctx.storage.put("config_id", id);
await this.ctx.storage.put("type", "chat");
```

### 6. Fetch Timeouts Required

All upstream service calls must have timeouts:
```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);  // 30s timeout

try {
  const res = await fetch(url, { signal: controller.signal, ...opts });
  // ...
} finally {
  clearTimeout(timeout);
}
```

Never make fetch calls without timeout.

### 7. Compaction Pattern

Insert summary FIRST, then delete old records:
```ts
const result = this.db.insert(schema.contextMessages).values({...}).returning().get();
if (!result?.id) return;

const summaryId = result.id;
this.db.delete(schema.contextMessages).where(sql`id < ${summaryId}`).run();
```

**Never** delete-then-insert — if insert fails after delete, data is lost.

### 8. Config Validation

Always normalize config after reading from storage:
```ts
const rawConfig = await this.ctx.storage.get("config");
const config = rawConfig ? normalizeChatRoutingConfig(rawConfig) : undefined;
```

Never use raw config — always validate via `normalizeChatRoutingConfig()`.

## Files & Responsibilities

| File | Responsibility | Don't |
|------|-----------------|-------|
| `src/schema.ts` | Drizzle table definitions | Add raw SQL; use schema.ts for migrations |
| `src/context-manager.ts` | Context assembly, token estimation, compaction | Pass `sql: any`; use `ContextManager` class |
| `src/chat/handler.ts` | Message CRUD, agent invocation, routing | Use raw `sql.exec()`; use Drizzle queries |
| `src/chat/decision-maker.ts` | Pure routing logic | This is fine as-is; stateless functions |
| `src/index.ts` | DO lifecycle, auth, archive/restore | Interpolate table names; whitelist + identifier() |

## Common Patterns

### Inserting Messages
```ts
this.db.insert(schema.messages).values({
  message_id: id,
  role: "user",
  text: content,
  sender_id: userId,
  tokens: estimatedTokens,
  created_at: new Date().toISOString(),
}).run();
```

### Querying with Filters
```ts
const rows = this.db
  .select()
  .from(schema.messages)
  .where(eq(schema.messages.agent_id, agentId))
  .orderBy(desc(schema.messages.created_at))
  .limit(10)
  .all();
```

### Deleting Conditionally
```ts
this.db
  .delete(schema.messageEvents)
  .where(eq(schema.messageEvents.message_id, msgId))
  .run();
```

## Adding New Features

**Adding a new table:**
1. Define in `src/schema.ts` using Drizzle
2. Run `npm run db:generate`
3. Commit the new migration file in `drizzle/migrations/`
4. Migration will auto-apply on next DO init

**Adding a new query method:**
1. Use `this.db.select()/insert()/update()/delete()` — never raw SQL
2. Type parameters using schema types
3. Chain `.all()`, `.get()`, or `.run()` at the end (never `.execute()` in DO context)

**Modifying existing queries:**
1. Update using Drizzle operators, not SQL strings
2. Keep type-safe — use schema column references
3. Run `npm run typecheck` to verify

## Testing

```bash
npm run typecheck          # Verify types
npm run dev               # Start local server on 8788

# Manual tests
POST /dev/:id/init        # Initialize DO
POST /dev/:id/messages    # Send message + invoke agents
GET /dev/:id/messages     # List message history
POST /dev/:id/archive     # Export all tables
```

## Deployment

```bash
npm run deploy            # Deploy to Cloudflare
```

Migrations will apply automatically on first `/init` request to a new DO.
