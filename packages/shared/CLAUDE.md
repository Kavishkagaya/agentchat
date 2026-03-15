# Shared

Shared types, API contracts, and auth utilities used across all apps and packages.

## Key Files

| Path | Role |
|------|------|
| `src/chat-contract.ts` | Chat routing config types, API payload types, validation schemas |
| `src/auth.ts` | Ed25519 token creation and verification (JWT-like) |
| `src/index.ts` | Re-exports |

## No Runtime Dependencies

This package has no database or external service dependencies. It provides pure types, validation schemas (Zod), and crypto utilities.

## Consumed By

All apps and packages in the monorepo.
