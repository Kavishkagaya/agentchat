## ADDED Requirements

### Requirement: Secret management is org-admin only
The system MUST allow only org admins to create, update, delete, or reveal secrets.

#### Scenario: Non-admin attempts secret change
- **WHEN** a non-admin user attempts to create, update, delete, or reveal a secret
- **THEN** the system rejects the action

### Requirement: Secrets store required fields and encrypted values
The system MUST store secrets with `id`, `name`, `value`, and `org_id`, and MUST persist `value` as encrypted ciphertext at rest.

#### Scenario: Create secret
- **WHEN** a user creates a secret
- **THEN** the system stores `id`, `name`, `org_id`, and an encrypted `value`

### Requirement: Secret fetch verifies org and decrypts value
The system MUST verify `org_id` ownership when fetching a secret by `id`, and MUST decrypt the stored value before returning it to authorized internal callers.

#### Scenario: Fetch secret by id
- **WHEN** infra or web services request a secret by `id`
- **THEN** the system checks the caller’s `org_id` matches the secret’s `org_id` and returns the decrypted value only on a match

### Requirement: Managed secrets do not expire
The system SHALL treat managed secrets as long-lived values with no TTL; secrets remain valid until explicitly updated or deleted by a user.

#### Scenario: Use secret without expiry
- **WHEN** a secret is used after a long period of time
- **THEN** the system treats it as valid unless it has been updated or deleted

### Requirement: Secret edits increment a version for cache invalidation
The system MUST increment a `version` field whenever a secret’s value changes, enabling infra caches to detect and invalidate stale entries.

#### Scenario: Edit secret
- **WHEN** a user updates a secret value
- **THEN** the system increments the secret’s `version`

### Requirement: Secret values are masked in the UI with explicit reveal
The system MUST mask secret values in the UI and allow org admins to reveal a secret value only through an explicit reveal action.

#### Scenario: Reveal secret in UI
- **WHEN** an org admin clicks a reveal control for a secret
- **THEN** the system shows the decrypted value for that secret
