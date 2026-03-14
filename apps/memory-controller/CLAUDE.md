# Memory Controller

Cloudflare Durable Object service that manages conversation history, message routing, and agent orchestration for multi-agent chats. Each chat gets its own Durable Object instance with local SQLite storage.

## Tech Stack

- **Runtime**: Cloudflare Workers + Durable Objects
- **Language**: TypeScript
- **Storage**: SQLite (Durable Object native) for messages; PostgreSQL (Neon) for config
- **Auth**: Ed25519 token verification (orchestrator tokens) + token creation (agent access tokens)

## Architecture

```
Orchestrator
  → POST /chats/:id/init          → MemoryController.fetch() → initialize DO
  → POST /chats/:id/messages      → ChatHandler.handle() → route to agents
  → GET  /chats/:id/messages      → ChatHandler.listMessages()
  → GET  /chats/:id/ws            → WebSocket upgrade → real-time streaming
  → POST /chats/:id/archive       → Snapshot all tables
  → POST /chats/:id/restore       → Reload from snapshot
  → POST /chats/:id/destroy       → Clear all tables

ChatHandler
  → [decision-maker.ts] Resolve target agents (explicit, @mention, default)
  → [context-manager.ts] Assemble context with token budgeting
  → fetch(AGENTS_BASE_URL/agents/run-stream) with signed JWT
  → Parse SSE stream → store messages → broadcast via WebSocket
```

## Key Files

| File | Role |
|------|------|
| `src/index.ts` | MemoryController Durable Object class, request routing, token verification |
| `src/chat/handler.ts` | ChatHandler: message CRUD, agent invocation (coarse/stream), SSE parsing, WebSocket broadcasting |
| `src/chat/decision-maker.ts` | Message routing: mention extraction, target agent resolution from config |
| `src/context-manager.ts` | Context assembly, token estimation (`words * 1.35 + 4`), compaction when exceeding threshold |
| `src/workflow/handler.ts` | WorkflowHandler stub (returns 501, not implemented) |

## SQLite Tables

- **messages** — Chat message history (message_id, role, text, agent_id, sender_id, sender_name, tokens, created_at)
- **context_messages** — Context window for agent prompts (role, text, tokens)
- **message_events** — Event tracking per message (routing_decision, tool_call, routing_warning, etc.)

## Message Routing

1. **Explicit**: `agent_ids` array in request body
2. **Mention**: `@agent_nickname` extracted from message text
3. **Default**: Config `default_agent` when `auto: true`
4. Supports recursive routing (agent responses re-routed on mentions, depth limit: 2)

## Monorepo Dependencies

- `@axon/shared` — Chat routing config types, message validation schemas, token creation/verification
- `@axon/worker-database` — DB client for config lookups

## Dev

```bash
npm run dev        # wrangler dev on port 8788
npm run deploy     # wrangler deploy
npm run typecheck  # tsc --noEmit
```

## Key Environment Variables

- `AGENTS_BASE_URL` — URL of the agents service
- `ORCHESTRATOR_PUBLIC_KEY` — Verify orchestrator tokens
- `GC_PRIVATE_KEY` — Sign agent access tokens
- `DATABASE_URL` — Optional Neon PostgreSQL for config lookups
