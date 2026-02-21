# Per-Chat Cluster

Each chat runs inside its own disposable cluster. The cluster contains the Chat Controller, Workers (Agents), and Sandboxes (Execution).

## I. The Chat Controller

- **Technology:** Cloudflare Durable Objects + SQLite.
- **Role:** The single source of truth for a chat session.
- **Authority:** Chat Controller is authoritative for in-chat state (messages, summaries, local task state) while running. Orchestrator is authoritative for infra state. R2 is authoritative for archived snapshots. On rehydrate, R2 snapshot wins and is written back into SQLite before accepting new messages.
- **Hard Parts:** Distributed locking and state consistency.
- **State Machine:** `active`, `idle`, `hibernated`, `error`, `terminating`.
- **State Transitions (MVP):**
  - `active -> idle` after inactivity timer; `idle -> active` on new message or tool activity.
  - `idle -> hibernated` after hibernation timer; `hibernated -> active` on wake (rehydrate if archived).
  - `active|idle -> terminating` on delete or long-idle archive; `terminating -> hibernated` after successful export and local wipe.
  - `* -> error` on unrecoverable failure; `error -> active` on manual restart.
- **Summarization Trigger:** User-defined milestones only.
- **Hibernation:** Hibernates after idle and rehydrates on wake. Memory persistence is handled via SQLite and R2 backups.
- **Timers:** Use Durable Object alarms for per-chat idle timers and retry backoff.
- **The Bridge:** Manages WebSockets for the UI and RPC calls for the Agents.
- **WebSocket Model:** Multiple concurrent clients per chat (group chat).
- **Streaming Policy:** MVP persists only final responses, but may stream progress events (status, tool logs, and optional token chunks) to reduce perceived latency. Final response is the only canonical persisted output.
- **Execution Model:** Parallel agent/tool execution allowed. Final responses are serialized into the chat log in a controlled order.
- **Commit Order:** FIFO by user message. Within a single message, agent responses are posted in completion order.
- **Sandbox Model (MVP):** Single project per chat. `sandbox_group_id = chat_id`. Code-touching tools queue within the group to avoid filesystem races. Isolated tasks can request separate sandboxes.
- **User Approval:** Sandbox creation requires explicit user approval. Users can reuse an existing sandbox or create a new one per request.
- **Interrupts:** New user messages can cancel in-flight tool chains. Cancellation is best-effort and should release sandbox resources if safe.
- **Context Assembly (MVP):** No semantic search. Use a per-agent focus prompt + summary + token-capped recent window + artifacts block. Include file snippets only when tools modified files.
- **Agent Management:** Agents are fixed after being added to the chat. Memory is shared at chat level only (no per-agent memory).
- **Sandbox Reuse:** Reuse existing sandbox by default. Agents can explicitly request a new sandbox when needed.
- **Failure Strategy:** Surface error in chat and retry with backoff.
- **Archival:** On long-idle archive request, export full chat state to R2 and wipe local SQLite state.
- **The Reaper:** Automatically signals Sandbox destruction when the session is idle.

## II. The Two-Layer Memory System

We decouple memory to optimize for both speed (latency) and cost (storage).

| Layer | Technology | Concern | Persistence |
| --- | --- | --- | --- |
| **Volatile** | Durable Object RAM/SQLite | Current discussion, active variables, and "Hot" state. | Idle-based |
| **Non-Volatile** | Cloudflare R2 | Files, code assets, snapshots, and long-idle chat backups. | 7 Days (Free) / Permanent (Prime) |

- **Chat Storage:** Messages and summaries live in Chat Controller SQLite (authoritative for active chats).
- **R2 Usage:** Full chat backup is written to R2 on long-idle archival (e.g., 2 days) so infra can be fully removed and later rehydrated.
- **Raw Buffer:** Token-capped rolling window with a default 50-message limit.
- **Summary Format:** Include `Goals`, `Decisions`, `Current State`, `Artifacts` (tool outputs + file diffs), and `Open Questions`.
- **Summary Consistency:** Each summary includes `summary_version` and `message_cursor` (last message id included). If the latest summary is missing, fall back to the last known summary + recent window and trigger a new summary asynchronously.

## III. The Sandbox Registry & Execution Host

- **Technology:** Cloudflare Sandbox SDK (Micro-VMs/Containers).
- **The Registry:** JSON templates with a pointer to an R2 folder (filesystem template). Provisioning copies from the R2 path.
- **Template Fields:** `cpu`, `memory`, `disk`, `sleepAfter`, `timeout`, `exposedPorts`.
- **Live Preview:** Uses Cloudflare Tunnel/Preview URLs to expose dev servers (Port 5173) to the user via an `<iframe>`.
- **Snapshots:** Use R2 workspace snapshots for crash recovery after task completion. Template snapshots for faster cold starts are optional and can be added later.
- **Lifecycle:** Sandboxes can auto-sleep after inactivity; infra can explicitly stop or destroy them.
- **MVP Policy:** `keepAlive` disabled. Dev servers stay up while active traffic exists, otherwise they can sleep.
- **Command Timeout:** 5 minutes per command (MVP default).

## IV. The Context Compiler ("The Scribe")

- **Technology:** Specialized Worker using Llama 3-8B / Gemini Flash.
- **Role:** Performs the "Accordion Compression" of history.
- **Aggressive Summarization:** Triggered by user-defined milestones only.
- **Sliding Window:** Token-capped recent buffer (default 50 messages).
- **Execution:** Runs as a separate Worker. Chat Controller requests summaries asynchronously and stores results in SQLite.
