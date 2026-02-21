# Overview

## Executive Summary

The **Agentic Cloud OS** is a platform where AI agents collaborate in a professional development environment. The architecture solves the "Context Bloat" and "Infrastructure Latency" problems by strictly separating **Reasoning (Agents Worker)**, **Coordination (Durable Objects)**, and **Execution (Sandboxes)**. The Agents Worker is a single shared stateless service that loads agent configs on demand (cached) and executes LLM calls.

## System Architecture Diagram

The flow follows a **Star Topology**:

1. **User** interacts with the **Chat Controller**.
2. **The Chat Controller** hydrates state from **R2** and briefs the **Agents Worker (shared)**.
3. **The Agents Worker** performs reasoning and calls the **Sandbox** if execution is required.
4. **The Sandbox** streams results back and shadow-copies files to **R2**.
