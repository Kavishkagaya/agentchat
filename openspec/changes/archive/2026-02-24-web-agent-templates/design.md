## Context

Agent Farther is the web-first agent creation experience. We need a flow that starts with listing org agents, lets users create new agents, attach MCP servers, and select MCP tools. MCP connections require tokens and must be validated by fetching tool lists in a worker-only environment. Public publishing must strip org-specific values.

## Goals / Non-Goals

**Goals:**
- Provide clear sidebar navigation for Agents and MCPs.
- Add a modal-driven “Add agent” entry point that leads into a full agent creation page.
- Support MCP management (list, add, validate) and tool selection per agent.
- Ensure MCP tool execution and validation remain worker-only.
- Publish flow that strips org-specific fields and preserves provenance.

**Non-Goals:**
- Agentic template creation or auto-generated agents.
- Marketplace discovery, ranking, or monetization.
- Client-side tool execution.

## Decisions

- **Agents are created via a dedicated creation page.**
  - Rationale: enables a full form for prompts, MCP selection, and tool picking.
  - Alternative: inline creation modal; rejected for complexity.

- **MCP servers are added at org level and validated on add.**
  - Rationale: ensures tool lists are real and tokens work before use.
  - Alternative: accept MCP servers without validation; rejected due to broken configs.

- **Tool selection is a step after MCP selection.**
  - Rationale: tool list is MCP-specific and should be fetched only after selection.
  - Alternative: show all tools upfront; rejected for confusion.

- **Publishing strips org-specific data.**
  - Rationale: public agents must not leak org tokens or secrets.
  - Alternative: allow public agents with secrets; rejected for security.

## Risks / Trade-offs

- **Risk:** MCP tool schemas change. → **Mitigation:** refresh tools on demand and cache per MCP.
- **Risk:** Publish flow removes defaults unexpectedly. → **Mitigation:** confirm publish and show what is stripped.
- **Risk:** Navigation changes require UI work. → **Mitigation:** update sidebar once and reuse routes.
