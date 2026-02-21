# Tools (MVP)

Tools are platform-defined capabilities that agents can use. For MVP, tools are curated and managed in code, using the Vercel AI SDK tool interface. Agents are granted explicit tool access at creation time.

## Tool Registry

- **Registry Source:** Code-defined list (curated by the platform).
- **Base Set:** Start with a safe subset of Vercel AI SDK-compatible tools plus platform tools.
- **Visibility:** All tools are public to all orgs; access is controlled per agent.
- **Org Policy:** Orgs can optionally restrict which tools are allowed via a policy allowlist.

## Tool Types

- **Non-Sandbox Tools:** Safe operations that do not require a sandbox (e.g., chat metadata, planning, summarization triggers).
- **Sandbox Tools:** Operations that execute code or touch files (e.g., run commands, edit files, start dev server).

## Approval Policy

- **Non-Sandbox Tools:** Auto-execute after policy checks.
- **Sandbox Tools:** Require explicit user approval before provisioning or reuse.
- **Risk Scoring:** The policy engine may block or require elevated approval for high-risk tools (network, file system, or secrets access).

## Tool Results & Artifacts

- **Chat Output:** Tool results are posted to the chat as part of the agent response.
- **Artifacts Block:** Tool outputs, commands run, and diffs are summarized in the context artifacts block (stored in SQLite).

## Limits

- **Infra-Impacting Tools:** Subject to sandbox quotas and policy checks.
- **Non-Sandbox Tools:** Rate-limited only if needed for abuse control.
