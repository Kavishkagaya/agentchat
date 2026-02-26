## ADDED Requirements

### Requirement: Agent creation requires provider selection
The agent creation flow MUST require selecting a provider from the provider catalog; agents MUST store a `provider_id` instead of a secret reference.

#### Scenario: Create agent with provider
- **WHEN** a user creates an agent
- **THEN** the system rejects submissions without a provider selection and stores the selected `provider_id` on success

### Requirement: Agent runtime resolves provider credentials
The agent runtime MUST resolve provider credentials via the provider catalog using `provider_id` and MUST NOT place secrets in model context.

#### Scenario: Invoke agent with provider credentials
- **WHEN** an agent is invoked
- **THEN** the system fetches provider credentials server-side and uses them for the request without including them in the prompt
