## Why

We need a web-first agent creation flow—branded as Agent Farther—that is decoupled from infra so we can ship the UI and workflows now. Separating templates (system prompt + tools) from instantiation (model + key via Cloudflare AI Gateway) enables faster iteration and a future marketplace without blocking on backend integrations.

## What Changes

- Add sidebar navigation for `Agents` and `MCPs`.
- `Agents` lists org agents and provides an “Add agent” button.
- “Add agent” opens a modal showing global/public agents with a “Create” CTA.
- “Create” opens the agent creation page where users define system prompt and agent properties.
- Agent creation includes an MCP section with an “Add MCP” button.
- “Add MCP” opens a modal listing org MCPs plus a “Create MCP” CTA.
- Selecting an MCP fetches its tools list and opens a tool-selection step to choose allowed tools.
- After agent creation, prompt to publish to public; publishing strips org-specific fields.
- `MCPs` page lists org MCP servers and provides “Add MCP” flow (URL, token, required fields).
- Out of scope: agentic (auto-generated) template creation; we’ll add that later.

## Capabilities

### New Capabilities
- `agent-management`: List org agents, create new agents, and select MCP tools during creation.
- `agent-publishing`: Publish agents to public with org-specific data stripped.
- `mcp-management`: Add MCP servers, validate them, fetch tools, and select tools for agents.

### Modified Capabilities
<!-- None yet: no existing specs in openspec/specs/. -->

## Impact

- `/Users/kavishka/agentchat/apps/web/app/dashboard/agents/` UI for agents list, create flow, publish prompt.
- `/Users/kavishka/agentchat/apps/web/app/dashboard/` UI for MCPs list and add flow.
- `/Users/kavishka/agentchat/apps/web/app/store/` and `/Users/kavishka/agentchat/apps/web/server/trpc/` for agent and MCP APIs.
- `/Users/kavishka/agentchat/packages/database/` schema/services for agents, MCPs, and tool selection.
- Integration points for Cloudflare AI Gateway configuration when instantiating agents.
