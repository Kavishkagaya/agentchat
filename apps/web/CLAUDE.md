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

## Rules & Patterns

### tRPC Error Handling

**Rule:** All procedure errors must use `TRPCError` from `@trpc/server`. Never throw raw `Error` inside a tRPC handler — it surfaces to clients as a generic `INTERNAL_SERVER_ERROR 500`.

✅ Correct
```ts
throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
```

❌ Wrong
```ts
throw new Error("Chat not found"); // becomes 500 INTERNAL_SERVER_ERROR
```

**Rule:** Use `NOT_FOUND` (not `FORBIDDEN`) when a resource belongs to another org — do not reveal that the resource exists.

**Rule:** Always add `if (error instanceof TRPCError) throw error;` as the first line of any `catch` block that re-maps errors to `TRPCError`. This prevents double-wrapping.

---

### Org Isolation on Resource Access

**Rule:** Any procedure that fetches a resource by ID must verify the resource belongs to `ctx.auth.orgId`. The middleware only guarantees the user is authenticated — it does not scope the fetch to the org.

✅ Correct
```ts
const chat = await getChat(input.chatId);
if (!chat || chat.orgId !== ctx.auth.orgId) {
  throw new TRPCError({ code: "NOT_FOUND" });
}
```

❌ Wrong
```ts
const chat = await getChat(input.chatId); // anyone can read any chat by ID
if (!chat) throw new Error("Chat not found");
```

---

### Redundant Auth Guards

**Rule:** Procedures using `orgProcedure` or `orgAdminProcedure` must NOT add manual `if (!ctx.auth.orgId)` guards inside the handler body. The middleware already guarantees non-null values — the guard is dead code.

❌ Wrong — dead code, misleads readers:
```ts
list: orgAdminProcedure.query(async ({ ctx }) => {
  if (!ctx.auth.orgId) throw new TRPCError({ code: "UNAUTHORIZED" }); // unreachable
  return await listSecrets(ctx.auth.orgId);
}),
```

✅ Correct:
```ts
list: orgAdminProcedure.query(async ({ ctx }) => {
  return await listSecrets(ctx.auth.orgId);
}),
```

---

### Client Mutation Error Handling

**Rule:** Every client-side `mutateAsync` call must be wrapped in `try/catch`. On error, show a toast using `sonner`. Never let async errors propagate silently.

✅ Correct
```ts
import { toast } from "sonner";
try {
  await createChat.mutateAsync(input);
  router.push("/dashboard");
} catch (err) {
  toast.error(err instanceof Error ? err.message : "Failed to create chat");
}
```

❌ Wrong — silent failure, user gets no feedback:
```ts
await createChat.mutateAsync(input);
router.push("/dashboard");
```

---

### Loading States on Submit Buttons

**Rule:** Every button that triggers a mutation must be `disabled` while `mutation.isPending` is `true`. This prevents double-submission.

✅ Correct
```tsx
<Button onClick={handleCreate} disabled={createChat.isPending}>
  {createChat.isPending ? "Creating…" : "Create"}
</Button>
```

❌ Wrong
```tsx
<Button onClick={handleCreate}>Create</Button>
```

---

### Form Initialization from Async Data

**Rule:** Use `useEffect` — not `useMemo` — to initialize form state from query data. `useMemo` is for pure computation; calling `setState` inside it is forbidden in React 19.

✅ Correct
```ts
useEffect(() => {
  if (agentQuery.data && !isInitialized) {
    setForm({ name: agentQuery.data.name, ... });
    setIsInitialized(true);
  }
}, [agentQuery.data, isInitialized]);
```

❌ Wrong — causes render-loop warnings in React 19 StrictMode:
```ts
useMemo(() => {
  if (agentQuery.data && !isInitialized) {
    setForm({ ... }); // setState inside useMemo — forbidden
  }
}, [agentQuery.data, isInitialized]);
```

---

### External Service Timeouts

**Rule:** All calls to external services (MCP servers via `fetchMcpTools`) must have a timeout. Use `Promise.race` with a rejection timer if the SDK does not accept an `AbortController` signal.

✅ Correct
```ts
const timeout = new Promise<never>((_, rej) =>
  setTimeout(() => rej(new Error("MCP fetch timed out after 15000ms")), 15_000)
);
return Promise.race([_fetchMcpToolsInternal(url, token), timeout]);
```

❌ Wrong — hangs indefinitely on an unresponsive server:
```ts
return fetchMcpTools(url, token); // no timeout
```

---

### String-Based Error Matching

**Rule:** Do not match `error.message` strings to determine error type. If the database layer changes its error text, the catch handler silently breaks. Prefer structured error classes or checking `instanceof TRPCError` first.

❌ Wrong — fragile:
```ts
if (error instanceof Error && error.message === "Skill not found") {
  throw new TRPCError({ code: "NOT_FOUND" });
}
```

✅ Acceptable (temporary — until DB layer exports typed errors):
```ts
if (error instanceof TRPCError) throw error; // don't double-wrap
if (error instanceof Error && error.message.includes("not found")) {
  throw new TRPCError({ code: "NOT_FOUND", message: error.message });
}
throw error;
```
