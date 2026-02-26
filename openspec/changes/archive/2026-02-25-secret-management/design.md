## Context

Secrets are referenced across MCP server auth, agent LLM credentials, and infra tokens, but storage and access rules are inconsistent. The docs already call out a secrets store, group grants, and agent secrets, and the DB schema includes `secrets` and `chat_secrets`, while MCP servers currently store a raw `token`. The Agents Worker must fetch secrets on demand and never place them in model context. We need a concrete design that unifies secret storage, references, grants, and runtime injection across UI, API, and workers, with explicit requirements for secret identity, encryption, org scoping, and provider-based credential selection.

## Goals / Non-Goals

**Goals:**
- Centralize secret storage with required fields (`id`, `name`, `value`, `org_id`) and encrypted `value` at rest.
- Ensure fetch-by-id verifies `org_id` and decrypts before use in infra/web paths.
- Enforce org-admin-only access for managing secrets and providers, with a safe UI reveal for secret values.
- Replace raw token storage in MCP configs with secret references, and store Cloudflare AI Gateway routing config via provider catalog entries.
- Ensure agents select providers (not secrets) and resolve credentials through the gateway-backed provider catalog, using a global gateway token managed as an infra secret.
- Enforce scope rules for secret access and inject secrets only at runtime.
- Support MCP validation and tool fetch with server-side secret resolution.
- Clarify boundaries between managed secrets and ephemeral tokens, and ensure managed secrets do not expire (no TTL).

**Non-Goals:**
- Full external secrets vault integration in this iteration.
- Public API or multi-region secret replication.
- Advanced secret versioning beyond rotation metadata.

## Decisions

1. Use a single secrets store keyed by `secret_id` with required fields `id`, `name`, `value`, `org_id`. Store `value` as encrypted ciphertext and keep `rotated_at` metadata. Optional fields (e.g., `namespace`, `version`) can be added without changing the required contract. Alternative of separate tables per secret type was rejected due to duplicated logic and more complex grants.

2. Store secret references on MCP servers and provider catalog entries as `secret_ref` (backed by `secret_id` in persistence). For Cloudflare AI Gateway pass‑through, provider entries store the provider key secret; the gateway token is global infra config (not stored per provider). Agents reference a `provider_id`, not a secret. This avoids raw token storage and keeps references stable across renames. Alternative of storing secret names directly in MCP/agent records was rejected because it complicates renames and referential integrity.

3. Restrict secret and provider CRUD to org admins and gate secret value reveal behind explicit admin action in the UI. Alternative of allowing all org members was rejected due to higher risk of credential leakage.

4. Enforce access via grants: org secrets require explicit group grants using `chat_secrets` (or an equivalent group mapping), while agent secrets remain org-wide by default in MVP per existing docs. This matches current system constraints while preserving a path to stricter per-group agent grants later.

5. Resolve secrets at runtime only. Agents Worker uses the provider catalog to route requests through Cloudflare AI Gateway with a global gateway token and per‑provider keys, and never includes secrets in the model prompt. The runtime composes `createAiGateway(...)` with `createUnified({ apiKey })` and uses a `provider.kind` + `model_id` path (e.g., `openai/gpt-5.2`). MCP validation and tool fetch use server-side resolution in a worker-only environment. Alternative of pre-injecting secrets into stored agent configs was rejected due to leakage risk and harder rotation.

6. Managed secrets do not expire (no TTL). To support cache invalidation, include a `version` field that increments on edits and use it for cache busting. Alternative of TTL-based invalidation was rejected because these secrets are long-lived and user-managed.

7. Treat ephemeral auth tokens (routing tokens, preview tokens) as non-secrets managed by the Orchestrator, not stored in the secrets store. This clarifies lifecycle and avoids mixing short-lived tokens with managed secrets.

8. Record audit events for secret create, update, delete, grant, revoke, and rotation actions using `audit_log`. This is required for compliance and incident response.

## Risks / Trade-offs

- [Cache staleness] Caches may briefly serve stale secrets after edits. -> Mitigation: use `version` checks and invalidate on edit events.
- [Migration complexity] Existing MCP tokens must be migrated to secret refs. -> Mitigation: phased rollout with backfill scripts and dual-read during transition.
- [Scope confusion] Users may misapply org vs agent secrets. -> Mitigation: clear UI labels, namespace scoping, and validation on assignment.

## Migration Plan

- Add `secret_ref` columns to MCP server records and provider catalog entries, and keep legacy token fields during transition.
- Backfill existing MCP tokens into secrets and replace with `secret_ref` values.
- Introduce provider catalog records (initially Cloudflare AI Gateway) and migrate agent selection to `provider_id`.
- Update API and UI to write provider selections and secret refs only; keep dual-read until migration is complete.
- Remove legacy token fields after successful backfill and verification.

## Open Questions

- Should provider catalog entries be org-scoped only, or allow shared/global providers later?
- Should we support direct providers in addition to AI Gateway in a later phase?
- Do we need separate namespaces for MCP vs generic org secrets, or is `org` sufficient?
- What rotation UX is required in the first release beyond `rotated_at` metadata?
