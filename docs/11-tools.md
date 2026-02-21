# Tools (MVP)

Tools are platform-defined capabilities that agents can use. For MVP, tools are curated and managed in code using the Vercel AI SDK tool interface. Agents are granted explicit tool access at creation time, and tools run inside the shared Agents Worker (no sandbox in MVP).

## Tool Registry

- **Registry Source:** Code-defined list (curated by the platform).
- **Base Set:** Small set of safe built-ins plus one configurable HTTP tool template.
- **Visibility:** All tools are public to all orgs; access is controlled per agent.
- **Org Policy:** Orgs can restrict which tools are allowed via a policy allowlist.

## Tool Types (MVP)

- **Built-in Tools:** Simple, safe utilities (e.g., `echo`, `current_time`).
- **Configurable HTTP Tool:** A single template that can call external APIs with per-agent configuration.

## Configurable HTTP Tool (`http_request`)

This template allows “bring your own tool” behavior without shipping code. Each agent provides the tool definition (name/description) and config (base URL and policy). The tool name can be customized per agent, so `http_request` can appear as a domain-specific tool (e.g., `create_ticket`).

**Config fields (per agent):**
- `base_url` (optional): Base URL for relative paths. Required if the tool call uses a relative `path`.
- `allowed_methods` (optional): Defaults to `["GET","HEAD"]`. Include `POST/PUT/PATCH/DELETE` to allow mutations.
- `default_method` (optional): Fallback method if not provided in args.
- `default_headers` (optional): Static headers merged with per-call headers.
- `default_query` (optional): Static query params merged with per-call params.
- `timeout_ms` (optional): Request timeout (default 10s).
- `auto_approve` (optional): If `true`, mutating calls can run without manual approval.
- `response_format` (optional): `auto` (default), `json`, or `text`.
- `max_response_chars` (optional): Max response size (default 20k chars).

**Runtime behavior:**
- Allows absolute URLs in args. If `path` is relative, it is resolved against `base_url`.
- Merges `default_*` values with call-time args.
- Returns a structured result with `ok`, `status`, `url`, and `data`.

## Approval Policy

- **Read-only tools:** Auto-execute after policy checks.
- **External mutating HTTP calls:** Require explicit user approval unless the tool config sets `auto_approve: true`.
- **Risk Scoring:** The policy engine may block or require elevated approval for high-risk tools.

## Tool Results & Artifacts

- **Chat Output:** Tool results are posted to the chat as part of the agent response.
- **Artifacts Block:** Tool outputs and diffs are summarized in the context artifacts block (stored in SQLite).

## Limits

- **External HTTP Tools:** Subject to org policy allowlists, method allowlists, timeouts, and response size caps.
- **Built-in Tools:** Rate-limited only if needed for abuse control.
