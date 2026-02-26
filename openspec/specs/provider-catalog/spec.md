## Purpose
TBD.

## Requirements

### Requirement: Provider catalog management is org-admin only
The system MUST allow only org admins to create, update, or delete provider catalog entries.

#### Scenario: Non-admin attempts provider change
- **WHEN** a non-admin user attempts to create, update, or delete a provider entry
- **THEN** the system rejects the action

### Requirement: Provider catalog lists org providers
The system SHALL list provider catalog entries for the current org.

#### Scenario: List providers
- **WHEN** a user opens the provider catalog
- **THEN** the system shows provider entries for the org

### Requirement: Provider entries bind provider credentials to a secret
The system MUST require a provider credential secret reference when creating or updating a provider entry.

#### Scenario: Create provider entry
- **WHEN** a user creates a provider entry
- **THEN** the system requires a provider type, name, and provider credential secret reference

### Requirement: Provider entries include model selection metadata
The system MUST store a provider kind and default `model_id` on each provider entry to construct unified model paths (e.g., `openai/gpt-5.2`).

#### Scenario: Save provider model metadata
- **WHEN** a user creates or updates a provider entry
- **THEN** the system stores `kind` and `model_id` for that provider

### Requirement: Cloudflare AI Gateway provider stores gateway config
For provider type `cloudflare_ai_gateway`, the system MUST require gateway configuration (e.g., `account_id`, `gateway_id`) and a provider credential secret reference, and MUST use a global gateway token managed as infra config (not per provider).

#### Scenario: Create AI Gateway provider
- **WHEN** a user creates a `cloudflare_ai_gateway` provider
- **THEN** the system requires gateway configuration fields and a provider credential secret reference

### Requirement: Provider selection is available during agent creation
The system MUST expose provider catalog entries for selection during agent creation.

#### Scenario: Select provider
- **WHEN** a user creates an agent
- **THEN** the system shows available providers for the org

### Requirement: Multiple providers of the same type are allowed
The system MUST allow multiple provider catalog entries with the same provider type, distinguished by user-defined names.

#### Scenario: Create duplicate provider types
- **WHEN** a user creates two providers with the same provider type but different names
- **THEN** the system stores both entries and lists them separately
