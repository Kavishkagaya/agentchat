# Overview

## Executive Summary

The **Agentic Cloud OS** is a platform where AI agents collaborate in a professional development environment. The architecture solves the "Context Bloat" and "Infrastructure Latency" problems by strictly separating **Reasoning (Agents Worker)**, **Coordination (Durable Objects)**, and **Execution (Sandboxes)**. The Agents Worker is a single shared stateless service that loads agent configs on demand (cached) and executes LLM calls.

## System Architecture Diagram

The flow follows a **Star Topology**:

1. **User** interacts with the **Group Controller**.
2. **The Group Controller** hydrates state from **R2** and briefs the **Agents Worker (shared)**.
3. **The Agents Worker** performs reasoning and executes tools (HTTP/Built-in).
4. **The Agents Worker** streams results back to the Group Controller.

## Security & Performance

### Chain of Trust Authentication
To secure communication between the persistent **Group Controller** and the stateless **Agents Worker**, we use a certificate-based approach:
1.  **Orchestrator as CA:** When a group starts, the Orchestrator generates an ephemeral **Session Key Pair** and issues a signed **Session Certificate** (JWT) containing the session's public key.
2.  **Group Controller Identity:** The Group Controller receives the private key and the certificate. It signs every request to the Agents Worker.
3.  **Stateless Verification:** The Agents Worker verifies the certificate using the Orchestrator's public key, then verifies the request signature using the session key embedded in the certificate. This allows for secure, stateless auth without database lookups on every request.

### User Access & WebSockets
To secure real-time communication between users and the Group Controller:
1.  **Stateless Routing Tokens:** The Orchestrator issues short-lived JWTs (`routing_token`) upon group entry, embedding user identity and group access rights.
2.  **WebSocket Handshake:** Clients connect via `wss://api.agentchat.com/ws/groups/{id}?token={routing_token}`. The Orchestrator validates the token statelessly (CPU-only check) before upgrading the connection and proxying to the Group Controller Durable Object, avoiding database hits on every message.

### High-Performance Caching
The Agents Worker utilizes a **Read-Through Caching** strategy with **Cloudflare KV**:
*   **Agent Configs:** System prompts, tools, and model configs are cached in KV.
*   **Active Invalidation:** Updates to agents (via API) write to both the database and KV, ensuring the worker always fetches the latest version without hitting the database for every run.
