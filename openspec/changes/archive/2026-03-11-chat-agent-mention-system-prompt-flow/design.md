## Context

The current runtime trigger path in memory-controller determines targets by:
1. `agent_ids` provided by request payload, otherwise
2. `config.auto === true` + `config.default_agent` fallback.

The web chat UI currently sends plain text messages over WS without explicit `agent_ids`, and chat config does not define nickname-to-agent mapping. This makes mention-based collaboration implicit and inconsistent.

This change introduces a strict routing contract with a centralized decision-maker and aligns chat setup UX with runtime behavior:
- Users configure agents, nicknames, responsibilities, and fallback behavior at chat creation.
- The system generates a prompt from that setup, user reviews/edits, then persists final config.
- Runtime resolves mentions to infra agent ids using one shared decision-maker across message ingress paths.

## Goals / Non-Goals

**Goals:**
- Create one deterministic routing contract for user-origin and agent-origin messages.
- Support nickname-based mentions in message text while keeping infra routing on `agent_id`.
- Ensure chat creation UI captures required routing inputs (nickname/responsibility/auto/default agent).
- Ensure fallback behavior is explicit: mention targets first, then default agent, else stop.
- Ensure HTTP and WS entrypoints produce identical routing decisions for equivalent messages.
- Ensure chat typing/interfaces are defined once and reused across API contracts and runtime config handling.

**Non-Goals:**
- Redesign agent execution engine or model/tool runtime internals.
- Introduce LLM-based mention extraction as source of truth for routing.
- Change orchestrator control-plane route structure.
- Implement agent-to-agent orchestration beyond the defined mention + auto gate.

## Decisions

### Decision 1: Centralize routing in a single memory-controller decision-maker
Implement one decision function/module (e.g., `resolveMessageTargets`) used by all chat message ingress paths and any agent-origin follow-up path.

Rationale:
- Prevents drift between WS and HTTP behavior.
- Enables one test surface for routing correctness.

Alternatives considered:
- **Separate per-route routing logic**: rejected due to high drift risk.
- **Frontend decides targets fully**: rejected because infra correctness/security must be server authoritative.

### Decision 2: Keep user-visible message text as nickname mentions; resolve ids server-side
Message text remains human format (`@nickname ...`). Backend maps nickname to `agent_id` using persisted chat config mapping.

Rationale:
- Preserves readable conversation content.
- Avoids exposing internal IDs to users.
- Keeps trigger logic deterministic and auditable.

Alternatives considered:
- **Embed raw agent IDs in message text**: rejected (poor UX, leaks internals).
- **UI replaces IDs visually**: rejected (introduces transform complexity and mismatch risks).

### Decision 3: Deterministic routing precedence and stop rule
Routing order is fixed:
1. Explicit `agent_ids` payload (if present)
2. Mention-derived targets
3. Default-agent fallback only when `auto=true` and `default_agent` exists
4. Otherwise no trigger (stop)

Rationale:
- Removes ambiguity and hidden fallback behavior.
- Makes outcomes predictable and testable.

Alternatives considered:
- **Mention + default both fire together**: rejected (unexpected fan-out).
- **Always fallback even when mention parse fails**: rejected (can hide mention errors).

### Decision 4: Agent-origin mention triggers are gated by `auto`
Agent-origin messages can trigger other agents only when `auto=true`.

Rationale:
- Preserves operator/user control over autonomous chaining.
- Prevents uncontrolled cascades in manual mode.

Alternatives considered:
- **Always allow agent-origin chaining**: rejected (risk of loops/spam).
- **Never allow chaining**: rejected (too restrictive for collaborative auto mode).

### Decision 5: Two-step chat creation with generated editable prompt
Chat creation becomes:
- Step 1: agent selection + required nickname/responsibility + auto/default settings.
- Step 2: generated system prompt preview/edit; finalized prompt persisted.

Rationale:
- Guarantees runtime prompt reflects configured team structure.
- Gives user final control before creation.

Alternatives considered:
- **No generated prompt, manual only**: rejected (inconsistent quality, missing structure).
- **Auto-generate without edit**: rejected (insufficient user control).

### Decision 6: Persist routing metadata in chat config before activation
Store finalized config in primary DB first, then trigger orchestrator activation; memory-controller init loads enriched config from DB.

Rationale:
- Fits current orchestrator->memory-controller init pattern.
- Avoids adding parallel config transport paths during activation.

Alternatives considered:
- **Send full config directly in init body**: rejected for now to minimize control-plane contract expansion.

### Decision 7: Centralize chat contract typing in shared package
Define canonical interfaces/types for chat config and message-routing payloads in one shared module (for example `@axon/shared`) and import them in web router validators, database service boundaries, orchestrator payload typing, and memory-controller runtime typing.

Rationale:
- Eliminates duplicated local interfaces that drift independently.
- Makes contract updates one-place changes with compile-time propagation.
- Reduces runtime mismatch risk between persisted config shape and API expectations.

Alternatives considered:
- **Per-service local interfaces**: rejected due to drift and duplicated maintenance.
- **Only schema-level typing in one app**: rejected because other services still require duplicated contract declarations.

## Risks / Trade-offs

- **[Risk] Nickname collisions or invalid names** -> Mitigation: strict validation and uniqueness constraints at chat creation/update.
- **[Risk] Unknown mentions in message text** -> Mitigation: treat as non-resolvable mention; apply deterministic fallback/stop rules and emit structured warning event.
- **[Risk] Behavior change may break existing clients** -> Mitigation: version/feature-flag gate and backward-compatible handling of missing mapping during migration.
- **[Risk] Agent chaining loops in auto mode** -> Mitigation: cap per-message trigger depth/iterations and dedupe triggered agent ids per cycle.
- **[Risk] Drift between WS and HTTP paths** -> Mitigation: both paths call same decision-maker and share integration tests.

## Migration Plan

1. Introduce canonical shared chat contract types and migrate existing chat config/payload interfaces to import from that module.
2. Add chat creation UI stepper with required fields and generated-prompt review step.
3. Persist enriched chat config and finalized prompt before orchestrator activation.
4. Introduce centralized decision-maker in memory-controller and refactor WS + HTTP paths to use it.
5. Add agent-origin path handling through same decision-maker with `auto` gating.
6. Add tests:
   - unit tests for decision precedence and guard rules
   - parity tests for WS vs HTTP routing outcomes
   - UI validation tests for creation requirements/default-agent constraints
7. Rollout under feature flag; monitor routing metrics and warning/error events.
8. Remove legacy branches once parity confidence is achieved.

Rollback:
- Disable feature flag to revert to previous trigger path (`agent_ids` / default-agent-only behavior).
- Preserve backward compatibility parser for existing chats without nickname mapping.

## Open Questions

- Should unknown mentions generate user-visible feedback in chat UI, or only telemetry/event logs?
- Should explicit `agent_ids` from client be allowed for all clients, or restricted to trusted/internal callers once mention routing is live?
- What exact depth/iteration cap should apply to agent-origin chaining in auto mode?
- Do we require per-chat override for mention token format (only `@nickname` vs configurable)?
