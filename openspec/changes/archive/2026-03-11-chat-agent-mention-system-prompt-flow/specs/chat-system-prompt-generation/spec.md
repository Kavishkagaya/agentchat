## ADDED Requirements

### Requirement: Chat setup MUST collect per-agent nickname and responsibility
The chat creation workflow MUST require nickname and responsibility values for every selected agent before allowing final creation.

#### Scenario: Block create when required metadata is missing
- **WHEN** at least one selected agent is missing nickname or responsibility
- **THEN** the create workflow remains blocked
- **AND** validation identifies the incomplete agent entry

#### Scenario: Allow proceed when all metadata is complete
- **WHEN** all selected agents have nickname and responsibility values
- **THEN** the workflow allows moving to prompt generation and review

### Requirement: System prompt MUST be generated from selected agent metadata
The system MUST generate an initial chat system prompt using selected agents, nicknames, and responsibilities.

#### Scenario: Generate prompt from configured team
- **WHEN** the user completes agent metadata in setup
- **THEN** the generated prompt includes each configured nickname and responsibility context

### Requirement: Generated system prompt MUST be editable before creation
The workflow MUST present the generated prompt for user edits and persist the final edited value at chat creation time.

#### Scenario: Persist edited prompt
- **WHEN** the user edits generated prompt text and confirms chat creation
- **THEN** the persisted chat config stores the edited prompt as `system_prompt`

### Requirement: Generated prompt MUST include mention-handling guidance
The generated prompt MUST define how participants should refer to agents by nickname for mention-based coordination.

#### Scenario: Prompt includes mention usage pattern
- **WHEN** prompt generation completes
- **THEN** the generated prompt includes guidance to use configured `@nickname` mentions for agent attention
