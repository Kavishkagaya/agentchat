# Memory Controller

The Memory Controller is a Stateful Durable Object responsible for managing the context, history, and execution state of various agentic interactions. It replaces the legacy "Group Controller" to reflect its broader role in managing memory and state beyond simple chat groups.

## Architecture

A Memory Controller is instantiated per "execution context" (a chat session, a workflow instance, etc.) and uses internal SQLite for persistence. We use a **single Durable Object class** (`MemoryController`) because the underlying infrastructure (Cloudflare DO + SQLite) is identical across all types. However, to maintain manageability, the internal codebase is structurally divided based on the execution type, delegating logic to specific handlers.

### Initialization & Configuration

The legacy concept of `config_id` is replaced by `config_id`. A `config_id` is strictly unique to every single created chat or execution instance (a 1:1 mapping). It does not act as a reusable template.
1. The client or orchestrator passes a unique `config_id` to initialize the interaction.
2. The worker fetches the associated configuration (which dictates if this is a single, multi-agent, or workflow instance, along with agent prompts, routing rules, or DAG definitions).
3. This configuration is stored locally within the DO's SQLite database to ensure "near live" execution without requiring constant round-trips to the global Postgres database.
4. **Schema Enforcement:** Upon initialization, the DO immediately enforces the specific SQLite schema required for its designated type.

## Supported Topologies

The Memory Controller supports three primary modes of operation. The mode is fixed at initialization based on the fetched config.

### 1. Single Agent
A standard, linear conversation between a user and a single AI agent.
- **State:** Linear array of messages.
- **Compaction:** Rolling window summarization when context limits are reached.
- **Schema Concept:** Simple `messages` table (`id`, `role`, `content`, `created_at`).

### 2. Multi-Agent
A collaborative environment with multiple agents.
- **Routing Modes:**
  - **Manual Mention:** Users explicitly mention agents to trigger them.
  - **Auto-Trigger:** The controller (or a lightweight router) evaluates the context to determine which agent(s) should act.
  - **Coordinator Agent:** The Memory Controller acts as the execution manager. It sends the formatted context to a dedicated Coordinator Agent. The Coordinator evaluates the context and returns an execution plan (next steps and sub-agent assignments). The Memory Controller then invokes the suggested sub-agents.
- **Context Engineering:** Requires specific context formatting to ensure agents understand their roles and the conversation history.
- **State:** Interleaved messages with agent attributions.
- **Schema Concept:** `messages` table with `agent_id` tracking, and potentially thread/reply-to mapping.

### 3. Workflow
A predefined graph of agent tasks, modeled as a **Directed Acyclic Graph (DAG)**.
- **Execution:** The Memory Controller manages the transition between intermediate states, acting as a lightweight workflow engine. It holds the DAG definition and passes specific context/outputs from one node to the next.
- **Compaction:** Not required for the workflow state itself, as inputs/outputs are tightly scoped between steps. 
- **Schema Concept:** 
  - `workflow_state`: Tracks current overall progress and status in the DAG.
  - `step_executions`: Tracks inputs, outputs, agent assignments, and status of individual nodes.

## Lifecycle and Dynamism
An instance's type (Single, Multi, Workflow) is not dynamic; it is permanently fixed based on the configuration it receives at initialization.