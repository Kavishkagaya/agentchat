# Agent Factory

Core agent execution engine. Builds and runs LLM agents with tool support via the Vercel AI SDK.

## Tech Stack

- **AI SDK**: Vercel AI SDK (`ai`)
- **Providers**: `@ai-sdk/openai`, Cloudflare AI Gateway

## Key Files

| Path | Role |
|------|------|
| `src/factory.ts` | `createAgentRunner` — main entry point for agent execution |
| `src/normalize.ts` | `normalizeAgentConfig` — config normalization |
| `src/types.ts` | Agent config and runner type definitions |
| `src/models/registry.ts` | Model provider registry |
| `src/models/openai.ts` | OpenAI model provider |
| `src/models/cloudflare-ai-gateway.ts` | Cloudflare AI Gateway provider |
| `src/tools/registry.ts` | Tool registry |
| `src/tools/defaults.ts` | Built-in default tools |

## Consumed By

- `apps/agents` — imports `createAgentRunner` and `normalizeAgentConfig`
