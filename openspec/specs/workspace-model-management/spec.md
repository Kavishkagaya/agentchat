## Purpose
Define model catalog management and provider metadata behavior for workspace runtime configuration.

## Requirements

### Requirement: Model mutations are org-admin only
The system MUST restrict model create, update, and delete operations to org admins.

#### Scenario: Non-admin model create
- **WHEN** a non-admin attempts model creation
- **THEN** the system rejects the request as unauthorized

### Requirement: Model list is org-scoped
The system MUST list model entries for the authenticated org.

#### Scenario: List models
- **WHEN** a user requests model list
- **THEN** the system returns models owned by the same org

### Requirement: Model create/update requires existing secret reference
The system MUST require `credentials_ref.secret_id` to resolve to an existing org secret.

#### Scenario: Create model with missing secret
- **WHEN** create payload references unknown secret id
- **THEN** the system rejects the request

### Requirement: Model runtime config fields are persisted
The system MUST persist config fields including `kind`, `model_id`, credentials reference, and enabled state.

#### Scenario: Persist model config
- **WHEN** a model is created or updated
- **THEN** stored model config includes required runtime fields

### Requirement: System model catalog metadata is admin-managed
The system MUST allow org-admin update of shared catalog metadata used by model selection UIs.

#### Scenario: Update provider catalog metadata
- **WHEN** admin submits catalog entries
- **THEN** system stores the updated metadata payload
