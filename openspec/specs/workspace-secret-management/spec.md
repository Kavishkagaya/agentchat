## Purpose
Define workspace secret lifecycle, access control, encryption, and reveal semantics.

## Requirements

### Requirement: Secret APIs are org-admin only
The system MUST restrict secret list/create/update/delete/reveal operations to org admins.

#### Scenario: Non-admin secret reveal
- **WHEN** a non-admin calls reveal
- **THEN** the system rejects the request

### Requirement: Secret values are encrypted at rest
The system MUST encrypt secret values before persistence and MUST NOT store plaintext values in storage tables.

#### Scenario: Create secret
- **WHEN** admin creates a secret with a value
- **THEN** the stored secret material is ciphertext

### Requirement: Secret access is org-scoped
The system MUST enforce org ownership for secret metadata and value access.

#### Scenario: Cross-org secret lookup
- **WHEN** a caller requests a secret from another org
- **THEN** the system returns not found or unauthorized

### Requirement: Secret value updates increment version
The system MUST increment secret version when secret value rotates.

#### Scenario: Rotate secret value
- **WHEN** admin updates secret value
- **THEN** secret version is incremented

### Requirement: Secret reveal returns decrypted value only on explicit action
The system MUST return decrypted secret value only through explicit reveal/value fetch paths for authorized callers.

#### Scenario: Reveal secret value
- **WHEN** an authorized reveal request is made
- **THEN** the system returns decrypted value for that secret
