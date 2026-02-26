## Why

Secrets are currently handled in multiple places (MCP auth tokens, agent LLM credentials, infra tokens) with inconsistent storage and access rules. We need a single, explicit secret management capability so sensitive data is stored once, referenced safely, and injected only when authorized.

## What Changes

- Introduce centralized org secret storage with encrypted at-rest values, CRUD, rotation metadata, and audit logging.
- Restrict secrets and provider management to org admins and add a secret reveal affordance in the UI.
- Add secret references that can be attached to agents and MCP servers instead of storing raw tokens in those records.
- Define secret grants/scopes (org, group/chat, agent) and enforce them when injecting secrets into runtime.
- Update MCP server management to use secret references for auth tokens during validation and tool fetch.
- Introduce a provider catalog that, for now, uses Cloudflare AI Gateway in BYOK pass-through mode; agents select a provider rather than a secret directly. The gateway token is a global infra secret, not stored per provider.
- Allow multiple provider entries for the same provider type (user-defined names, no global uniqueness).
- Update agent creation to require selecting a provider; the worker resolves provider credentials via the gateway and never places secrets in model context.
- Clarify which tokens are ephemeral (e.g., routing/preview) vs. managed secrets, and document handling boundaries.

## Capabilities

### New Capabilities
- `secret-management`: Centralized storage, rotation, access control, and injection of org/agent secrets with audit trails and secret references usable by MCP and agents.
- `provider-catalog`: Org-scoped catalog of providers (initially Cloudflare AI Gateway BYOK) that expose selectable providers to agents.

### Modified Capabilities
- `mcp-management`: MCP auth tokens are stored and referenced via secrets; add/edit flows use secret refs and runtime resolves them when validating/using MCP tools.
- `agent-management`: Agent creation requires selecting a provider; agent runtime resolves provider credentials via the gateway with proper scoping.

## Impact

- UI: secrets management page, provider catalog UI, agent creation flow, MCP add/edit flow.
- API/services: secrets CRUD/grants, provider catalog CRUD, MCP validation, agents worker secret fetch path.
- Data: secrets tables and references in MCP/provider records; audit logging for secret actions.
- Docs/specs: new secret-management spec and updates to MCP/agent specs.
