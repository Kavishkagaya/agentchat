## 1. Data Contract and Persistence

- [x] 1.1 Create canonical shared chat contract type module (chat config + routing payload interfaces) and export it for cross-service use
- [x] 1.2 Migrate web router, database service, orchestrator, and memory-controller to import canonical chat contract types instead of local duplicates
- [x] 1.3 Extend canonical chat config contract/schema to store agent nickname mapping, responsibilities, `auto`, `default_agent`, and finalized `system_prompt`
- [x] 1.4 Add validation rules for chat setup payload (required nickname/responsibility per selected agent, unique nicknames, valid default-agent selection)
- [x] 1.5 Update chat database service create/update paths to persist enriched config atomically before runtime activation
- [x] 1.6 Add backward-compatible read handling for existing chats without nickname mapping

## 2. Chat Creation API and UI Flow

- [x] 2.1 Update chat create API contract (tRPC/router + validators) to accept two-step payload fields and reject invalid combinations
- [x] 2.2 Implement step 1 UI for agent selection plus required nickname/responsibility entry for each selected agent
- [x] 2.3 Implement `auto` toggle and default-agent selection UI constrained to selected agents
- [x] 2.4 Implement step 2 generated system prompt preview/edit and include finalized prompt in create submission
- [x] 2.5 Block create action until all required step data is valid and show clear validation feedback

## 3. Orchestrator Activation Consistency

- [x] 3.1 Ensure orchestrator activation is called only after enriched chat config is committed
- [x] 3.2 Ensure activation fails cleanly when memory-controller init cannot load required routing config
- [x] 3.3 Add/adjust integration checks that activation uses persisted config as source of truth

## 4. Memory Controller Centralized Routing

- [x] 4.1 Implement a shared decision-maker module for target resolution used by both websocket and HTTP ingress paths
- [x] 4.2 Implement nickname mention parsing and nickname->`agent_id` resolution from persisted chat mapping
- [x] 4.3 Enforce deterministic precedence: explicit `agent_ids` (if present), then valid mentions, then default fallback (`auto=true` + `default_agent`), else stop
- [x] 4.4 Enforce agent-origin mention gating: allow mention-trigger chaining only when `auto=true`
- [x] 4.5 Refactor existing message handlers to route through the shared resolver and remove duplicated trigger logic

## 5. Verification and Safeguards

- [x] 5.1 Add unit tests for decision-maker coverage (valid mention, unknown mention, fallback, stop, agent-origin gating)
- [x] 5.2 Add parity tests that websocket and HTTP message paths yield identical routing decisions for equivalent input
- [x] 5.3 Add API/UI tests for chat creation validation and two-step payload requirements
- [x] 5.4 Add safeguards for auto-mode chaining (dedupe targets per cycle and cap trigger depth/iterations)
- [x] 5.5 Add rollout guard (feature flag/config gate) and telemetry for routing warnings (for example unknown mentions)
