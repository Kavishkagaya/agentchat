## 1. Data Model & Migrations

- [x] 1.1 Review existing `secrets` table schema and add missing fields (`name`, `org_id`, `version`) if required
- [x] 1.2 Add provider catalog table/model with `provider_id`, `org_id`, `provider_type`, `name`, and `secret_ref`
- [x] 1.3 Add `secret_ref` column to MCP server records while keeping legacy token fields
- [x] 1.4 Add `provider_id` to agent records and migrate from any existing secret reference
- [x] 1.5 Add indexes/constraints for secret lookup by `id` and `org_id`

## 2. Secrets Service (Crypto + Versioning)

- [x] 2.1 Implement encryption/decryption utilities for secret `value` at rest
- [x] 2.2 Build secrets service methods for create/read/update/delete with `org_id` enforcement
- [x] 2.3 Increment `version` on secret value changes and expose for cache invalidation
- [x] 2.4 Add infra-level global gateway token secret and load into runtime config

## 3. API + Access Control

- [x] 3.1 Add internal API for fetching secret by `id` with `org_id` verification and decrypted response
- [x] 3.2 Add secrets CRUD endpoints for org scope (web/API layer) with audit logging
- [x] 3.3 Enforce org-admin-only access for secrets and provider catalog mutations
- [x] 3.4 Add provider catalog CRUD endpoints with org scoping and secret reference validation
- [x] 3.5 Ensure managed secrets have no TTL and are treated as long-lived values

## 4. MCP Integration

- [x] 4.1 Update MCP create/edit flows to require `secret_ref` instead of raw token
- [x] 4.2 Resolve `secret_ref` during MCP validation/tool fetch in worker-only environment
- [x] 4.3 Backward-compat read path for legacy token until migration is complete

## 5. Agent & Provider Integration

- [x] 5.1 Update agent creation API to require `provider_id` selection
- [x] 5.2 Resolve provider secret at runtime in Agents Worker without placing it in model context
- [x] 5.3 Expose provider catalog to agent creation flow

## 6. UI Updates

- [x] 6.1 Build secrets management UI (list/create/edit/delete) for org secrets
- [x] 6.2 Add masked secret display with explicit reveal for org admins
- [x] 6.3 Build provider catalog UI (list/create/edit/delete)
- [x] 6.4 Add provider selection to agent creation form
- [x] 6.5 Add secret selection to MCP add/edit UI

## 7. Migration & Backfill

- [x] 7.1 Backfill existing MCP tokens into secrets and populate `secret_ref`
- [ ] 7.2 Validate `version` and cache invalidation flow after backfill
- [ ] 7.3 Remove legacy token fields after rollout verification

## 8. Tests & Docs

- [ ] 8.1 Add tests for secrets CRUD, encryption, org enforcement, and version bump
- [ ] 8.2 Add tests for MCP validation using `secret_ref`
- [ ] 8.3 Add tests for agent creation requiring `secret_ref`
- [ ] 8.4 Update docs to clarify managed secrets vs ephemeral tokens
