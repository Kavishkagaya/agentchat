# Message Lifecycle

1. **Ingress:** User sends a message via Next.js UI (Cloudflare Pages).
2. **Hydration:** The **Chat Controller** wakes up. It loads summary and recent context from SQLite. If the chat was archived, it rehydrates from an R2 backup before accepting new messages.
3. **Briefing:** The Chat Controller sends the **Summary + Recent Window** to the **Agent Worker**.
4. **Action:** The Agent decides if it needs a Sandbox (e.g., "I need to test this React component").
5. **Approval:** The user approves sandbox creation (reuse existing or create new).
6. **Provisioning:** The **Chat Controller** requests a Sandbox based on the **Registry Template**.
7. **Execution:** The Sandbox runs the code. The **Live Preview** URL is sent to the UI. Progress events (status/tool logs) may stream to the UI while execution is in-flight.
8. **Turning Point:** On user-defined milestone, the Chat Controller triggers **Aggressive Summarization** and stores the result in SQLite with a `message_cursor`.
