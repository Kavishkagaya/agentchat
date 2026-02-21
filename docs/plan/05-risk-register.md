# Risk Register

1. Risk: Chat state divergence between SQLite, Postgres, and R2. Mitigation: clear authority boundaries and rehydrate precedence rules.
2. Risk: Orchestrator routing drift or stale chat_runtime records. Mitigation: short TTL caches and periodic reconciliation on access.
3. Risk: Long-running external tool chains block new messages. Mitigation: cancellation on new user message and bounded tool execution.
4. Risk: Summary lag causes stale context. Mitigation: message_cursor tracking and async re-summarization.
5. Risk: Billing mismatch due to delayed usage flush. Mitigation: in-memory counters with frequent flush and reconciliation jobs.
6. Risk: Archived chats missing files due to R2 retention. Mitigation: metadata stub cleanup and clear user messaging.
7. Risk: Agent tool misuse (external side effects or data exfiltration). Mitigation: org allowlist, approvals, and risk scoring in policy engine.
8. Risk: Agent runtime incompatibility with selected SDKs. Mitigation: validate Vercel AI SDK compatibility early and pin versions if needed.
