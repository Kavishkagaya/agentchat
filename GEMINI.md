# Agentic Cloud OS

## Project Overview

The **Agentic Cloud OS** is a platform enabling AI agents to collaborate in a professional development environment. It employs a **Star Topology** architecture to strictly separate reasoning, coordination, and execution, solving common issues like context bloat and infrastructure latency.

### Architecture

*   **Chat Controller (Durable Object):** The coordination center for each chat session. It manages state, message history, and coordinates between the user and agents.
*   **Agents Worker (Stateless):** A shared, stateless service that performs LLM reasoning. It loads agent configurations on demand and delegates execution to sandboxes.
*   **Orchestrator (Global Control Plane):** Manages infrastructure (sandboxes), routing, billing, and identity. It handles the lifecycle of chat clusters.
*   **Sandbox (Execution):** Isolated environments where agents can execute code. Results are streamed back, and files are shadow-copied to R2.
*   **Web Interface:** A Next.js application providing the user interface for interacting with agents.

## Directory Structure

### Apps (`apps/`)

*   **`apps/agents`**: The **Agents Worker**. A Cloudflare Worker that uses `@axon/agent-factory` to run agents.
*   **`apps/chat-controller`**: The **Chat Controller**. A Cloudflare Worker implementing a Durable Object for per-chat state management.
*   **`apps/orchestrator`**: The **Orchestrator**. A Cloudflare Worker acting as the global control plane for infrastructure provisioning and billing.
*   **`apps/web`**: The **Frontend**. A Next.js application using tRPC, React Query, and Zustand. Note: Authentication (Clerk) and explicit auth logic seem to be handled externally or are work-in-progress.

### Packages (`packages/`)

*   **`packages/agent-factory`**: A library for constructing and running agents, providing provider-agnostic abstractions.
*   **`packages/db`**: Shared Drizzle ORM schemas and database utilities for the Neon Postgres database.
*   **`packages/shared`**: Common utilities shared across the monorepo.

### Documentation (`docs/`)

The `docs/` directory contains comprehensive architectural documentation:
*   `01-overview.md`: High-level system design.
*   `02-global-control-plane.md`: Details on the Orchestrator's role.
*   `08-postgres-schema.md`: Database schema documentation.

## Development

### Prerequisites

*   **Node.js**
*   **pnpm** (Package Manager)
*   **Neon Postgres** (Database)
*   **Cloudflare Account** (for Workers/R2)

### Key Commands

Run these commands from the root directory:

*   **Start Development Server:**
    ```bash
    pnpm dev
    ```
    (Runs `pnpm -r dev`, starting all services in parallel)

*   **Build Project:**
    ```bash
    pnpm build
    ```

*   **Type Check:**
    ```bash
    pnpm typecheck
    ```

*   **Lint:**
    ```bash
    pnpm lint
    ```

*   **Format:**
    ```bash
    pnpm format
    ```

### Configuration & Environment

*   **Database:** The project uses **Neon Postgres**. Connection strings are expected in environment variables (e.g., `DATABASE_URL`, `NEON_DATABASE_URL`).
*   **Cloudflare:** `wrangler.toml` files in `apps/agents`, `apps/orchestrator`, and `apps/chat-controller` configure Cloudflare Workers.
*   **Environment Variables:** Check `env.ts` files in respective apps and `.env` files (not committed) for required keys.

## Tech Stack

*   **Runtime:** Cloudflare Workers, Node.js (Next.js)
*   **Frameworks:** Next.js, tRPC, Hono (implied by router structure in Orchestrator), Drizzle ORM
*   **Language:** TypeScript
*   **Infrastructure:** Cloudflare (Workers, R2, Durable Objects), Neon (Postgres)
