# Business Logic & Monetization

- **Free Tier:** 7-day data retention via R2 Lifecycle Policies. Limited Sandbox CPU/RAM.
- **Prime Tier:** Permanent persistence of the "Desktop" state (R2 folders). Higher resource limits and faster "Pre-warmed" sandboxes.
- **Metadata Retention:** When R2 data expires on the free tier, the chat remains in Postgres as an archived stub for a short grace period, then is hard-deleted to avoid dangling records.
