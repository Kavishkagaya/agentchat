# Agents (MVP)

Agents are user-created and can be shared publicly or kept private. The platform provides a base agent template (Vercel AI SDK) and two creation paths: manual creation and the Agent Father (a global agent that helps users craft agents via chat).

## Agent Registry

- **Public Registry:** Free marketplace. Any user can publish an agent.
- **Private Registry:** Org-scoped agents visible only to the creator's org.
- **Visibility:** `public` or `private` per agent.

## Agent Creation

### Manual Creation

- User supplies `system_prompt`, `model`, `tools`, and optional metadata.
- Agent is saved to the registry as `private` by default.

### Agent Father

- A global agent that helps users create new agents via chat.
- Outputs a standard agent config using the base template.
- Created agents can be published or kept private.

## Base Agent Template

- **Runtime:** Vercel AI SDK.
- **Injected Inputs:** `system_prompt`, `model`, `tools`, and optional env profile.
- **Behavior:** No per-agent memory. All memory is shared at chat level.

## Agent Runtime Service (MVP)

- **Architecture:** Single shared Agents Worker (stateless) used by all chats.
- **Config Loading:** Agent configs and secrets are fetched on demand and cached in memory with short TTL. Cache is non-authoritative and can be evicted at any time.
- **Invocation:** Chat Controller calls the Agents Worker with `agent_id` (or `runtime_id`) plus context. The worker reconstructs the agent via the base template and executes the LLM call.
- **Isolation:** Chat is the trust boundary. Secrets are scoped per chat and never placed in model context; tools receive scoped secrets only when executing.

## Chat Attachment Model

- Users pick agents from the registry when creating a chat.
- The same agent definition can be instantiated multiple times in the same chat (logical runtimes in the shared Agents Worker).
- Agents are fixed after being added to a chat (MVP).

## Agent Triggering & Selection (MVP)

- **Chat Policy:** Users choose whether agents auto-trigger or only respond when explicitly invoked.
- **Multi-Agent Mode:** If enabled, multiple agents may respond to the same message. If disabled, only the explicitly selected agent responds.
- **Selection:** No classifier in MVP. Selection is driven by chat policy and user choice.
- **Ordering:** For a single user message, responses are posted in completion order. Across messages, the Chat Controller preserves FIFO order by message trigger time.
- **Agent Discussion:** Optional mode where agents can respond to other agents. Must be bounded by a max-round limit and cooldown to avoid loops.
  - **Max Rounds:** Configurable per chat (default 2).
  - **Cooldown:** Auto-trigger cooldown is 15 seconds per agent per chat.

## Tool Permissions (MVP)

- Tools are defined per agent at creation time.
- Agents can only use the tools granted to them.
- Tools are selected from the platform tool registry (Vercel AI SDK-compatible).

## Marketplace (MVP)

- Free to publish and use.
- No paid listing or monetization in MVP.
- **Moderation:** New agents are checked by the Agent Father for malicious intent. User reports allow manual takedowns.
