## Why

Current chat routing is not a strict contract for mention-based multi-agent coordination. Triggering currently depends on payload `agent_ids` or `auto + default_agent`, while nickname mention mapping is not defined as a first-class chat contract.

We need a deterministic end-to-end flow: chat setup, stored config, runtime decision-maker, and agent triggering must all follow one rule set that always works.

## What Changes

- **BREAKING**: Chat creation requires agent setup metadata, not only a flat `agentIds` selection.
- Add a 2-step chat creation UI:
  - Step 1: Select agents and define nickname + responsibility for each selected agent.
  - Step 2: Auto-generate a chat system prompt from that mapping, show it, and allow user edits before final create.
- Persist in chat config:
  - finalized `system_prompt`
  - nickname -> `agent_id` mapping
  - responsibilities
  - routing flags (`auto`, `default_agent`)
- Introduce a single canonical chat contract type module (shared package) used by web API, database services, orchestrator, and memory-controller to prevent duplicated interfaces.
- Introduce one centralized memory-controller decision-maker used by both message ingress paths:
  - user-origin messages
  - agent-origin messages
- Keep mention text user-facing (nickname style, e.g. `@alex`), and resolve to infra `agent_id` only in backend routing logic.
- Enforce one deterministic routing rule:
  1. If message has valid mentions, trigger mapped agents.
  2. Else if `auto` is enabled and `default_agent` is set, trigger default agent.
  3. Else trigger no agent and stop.
- Agent-to-agent guard:
  - Agent-origin mentions may trigger other agents only when `auto` is enabled.
  - If `auto` is disabled, agent-origin mentions must not trigger additional agents.
- Ensure identical decision behavior for both HTTP and WS message paths.
- Keep orchestrator activation shape (create -> orchestrator activate -> memory-controller init loading config), but guarantee enriched chat config is persisted before activation so init loads the finalized prompt + mapping.

### User Scenarios To Cover

- **Scenario: Create chat with required agent metadata**
  - User selects one or more agents.
  - For each selected agent, user must provide nickname and responsibility.
  - Create action is blocked until required metadata is complete.
- **Scenario: Configure default-agent behavior in chat creation UI**
  - UI exposes `auto` toggle and default-agent selection.
  - Default agent options are constrained to selected chat agents.
  - If `auto=true`, default agent selection is required.
  - If `auto=false`, default agent is optional and not used for fallback triggering.
- **Scenario: Generate and edit system prompt before create**
  - After agent setup, UI generates a system prompt using nickname/responsibility mapping.
  - User can edit the generated prompt before final create.
  - Final create persists edited prompt in chat config.
- **Scenario: Mention-based trigger from user message**
  - User sends message containing `@nickname`.
  - Decision-maker resolves nickname -> `agent_id` and triggers only resolved agents.
- **Scenario: No mention in user message**
  - If no valid mention and `auto=true` with `default_agent` configured, trigger default agent.
  - If no valid mention and fallback conditions are not met, trigger none and stop.
- **Scenario: Agent-origin mention behavior**
  - Agent message may trigger mentioned agents only when `auto=true`.
  - If `auto=false`, agent-origin mentions do not trigger additional agents.
- **Scenario: Consistent routing across ingress paths**
  - Same logical message via WS and HTTP yields identical routing decisions.

## Capabilities

### New Capabilities
- `chat-agent-mention-contract`: Canonical nickname mention routing contract, including mapping, trigger rules, and user/agent path behavior.
- `chat-system-prompt-generation`: Chat-creation step for prompt auto-generation and user editing based on selected agents and responsibilities.
- `chat-contract-typing`: Canonical shared typing/interfaces for chat config and message routing contracts across API/runtime layers.

### Modified Capabilities
- `workspace-chat-management`: Chat creation requirements change to support two-step setup, required nickname/responsibility metadata, `auto/default_agent` setup, and finalized prompt persistence.
- `runtime-orchestrator-chat`: Activation flow requirements change to depend on enriched chat config being available for memory-controller init.
- `runtime-memory-controller`: Routing requirements change to use one centralized decision-maker for user and agent message paths with deterministic mention/default/stop behavior.

## Impact

- UI: New chat creation flow becomes structured and two-step.
- API contracts: chat create/update payloads include agent setup metadata and finalized prompt fields.
- Data model/config: chat config stores mention map + responsibility metadata + finalized prompt + routing flags.
- Runtime logic: centralized decision-maker added in memory-controller; both WS and HTTP routes use it.
- Trigger behavior: predictable routing with explicit stop condition when no valid target exists.
- Type contracts: API payload types and persisted config interfaces are defined once in shared package and imported by all layers.
- Likely affected code:
  - `apps/web/app/dashboard/page.tsx`
  - `apps/web/app/dashboard/chats/**`
  - `apps/web/server/trpc/routers/chats.router.ts`
  - `packages/shared/src/**`
  - `packages/database/src/services/chats.ts`
  - `apps/orchestrator/src/router.ts`
  - `apps/memory-controller/src/index.ts`
  - `apps/memory-controller/src/chat/handler.ts`
