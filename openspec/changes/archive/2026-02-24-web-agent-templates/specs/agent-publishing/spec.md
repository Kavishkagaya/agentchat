## ADDED Requirements

### Requirement: Post-create publish prompt
After agent creation, the system MUST prompt the user to publish the agent to public.

#### Scenario: Publish prompt after create
- **WHEN** an agent is created successfully
- **THEN** the UI prompts the user to publish it

### Requirement: Publishing strips org-specific data
Publishing MUST remove org-specific fields (tokens, secrets, org ids) before creating the public agent.

#### Scenario: Strip org fields on publish
- **WHEN** a user publishes an agent
- **THEN** the public agent record excludes org-specific fields

### Requirement: Public agents can be copied to org
Users MUST be able to add a public agent to their org as a copy.

#### Scenario: Copy public agent
- **WHEN** a user selects a public agent to add
- **THEN** the system creates a new org-owned agent based on the public one
