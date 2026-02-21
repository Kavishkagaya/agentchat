# Risk Register

1. Risk: Duplicate sandbox creation on retries. Mitigation: idempotency keys and deterministic sandbox_id return.
2. Risk: Token revocation fails for preview access. Mitigation: `sandbox_epoch` in JWT and increment on stop.
3. Risk: Chat state divergence between SQLite, Postgres, and R2. Mitigation: clear authority boundaries and rehydrate precedence rules.
4. Risk: Long-running tool chains block new messages. Mitigation: cancellation on new user message and bounded tool execution.
5. Risk: Egress abuse from sandboxes. Mitigation: egress limits per org and per sandbox with policy checks.
6. Risk: Summary lag causes stale context. Mitigation: message_cursor tracking and async re-summarization.
7. Risk: Preview gateway overload from noisy dev servers. Mitigation: rate limiting per sandbox and connection caps.
8. Risk: Billing mismatch due to delayed usage flush. Mitigation: in-memory counters with frequent flush and reconciliation jobs.
9. Risk: Archived chats missing files due to R2 retention. Mitigation: metadata stub cleanup and clear user messaging.
10. Risk: Agent tool misuse. Mitigation: org allowlist and risk scoring in policy engine.
11. Risk: Agent runtime incompatibility with selected SDKs. Mitigation: validate Vercel AI SDK compatibility early and pin versions if needed.
