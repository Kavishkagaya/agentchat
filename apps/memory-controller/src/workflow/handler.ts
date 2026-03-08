import { createAgentAccessToken } from "@axon/shared";
import type { Env } from "../index";

export class WorkflowHandler {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  async ensureSchema() {
    const sql = this.ctx.storage.sql;
    if (!sql) throw new Error("SQLite storage is not available");
    
    // Workflow overall state
    sql.exec(`
      CREATE TABLE IF NOT EXISTS workflow_state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
        current_node_ids TEXT, -- JSON array of active node IDs
        context TEXT, -- Global JSON context for the workflow
        updated_at TEXT NOT NULL
      )
    `);

    // Execution history of individual nodes/steps
    sql.exec(`
      CREATE TABLE IF NOT EXISTS node_executions (
        execution_id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        agent_id TEXT,
        status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
        input TEXT, -- JSON input passed to this node
        output TEXT, -- JSON output returned by this node
        error TEXT,
        started_at TEXT,
        completed_at TEXT
      )
    `);
  }

  private async getWorkflowState() {
    const sql = this.ctx.storage.sql;
    const rows = Array.from(sql.exec("SELECT status, current_node_ids, context FROM workflow_state WHERE id = 1")) as any[];
    if (rows.length === 0) return null;
    return {
      status: rows[0].status,
      current_node_ids: JSON.parse(rows[0].current_node_ids || "[]"),
      context: JSON.parse(rows[0].context || "{}")
    };
  }

  private async updateWorkflowState(params: { status?: string, current_node_ids?: string[], context?: any }) {
    const sql = this.ctx.storage.sql;
    const current = await this.getWorkflowState() || { status: 'pending', current_node_ids: [], context: {} };
    
    const status = params.status || current.status;
    const nodeIds = params.current_node_ids ? JSON.stringify(params.current_node_ids) : JSON.stringify(current.current_node_ids);
    const context = params.context ? JSON.stringify(params.context) : JSON.stringify(current.context);
    const now = new Date().toISOString();

    sql.exec(
      "INSERT INTO workflow_state (id, status, current_node_ids, context, updated_at) VALUES (1, ?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET status=?1, current_node_ids=?2, context=?3, updated_at=?4",
      status, nodeIds, context, now
    );
  }

  private async recordNodeExecution(params: {
    executionId: string;
    nodeId: string;
    agentId?: string;
    status: string;
    input?: any;
    output?: any;
    error?: string;
  }) {
    const sql = this.ctx.storage.sql;
    const now = new Date().toISOString();
    
    sql.exec(`
      INSERT INTO node_executions (execution_id, node_id, agent_id, status, input, output, error, started_at, completed_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(execution_id) DO UPDATE SET status=?4, output=?6, error=?7, completed_at=?9
    `,
      params.executionId,
      params.nodeId,
      params.agentId || null,
      params.status,
      params.input ? JSON.stringify(params.input) : null,
      params.output ? JSON.stringify(params.output) : null,
      params.error || null,
      params.status === 'running' ? now : null,
      (params.status === 'completed' || params.status === 'failed') ? now : null
    );
  }

  async handle(request: Request, route: string): Promise<Response> {
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });

    const configId = (await this.ctx.storage.get("config_id")) as string;
    const config = (await this.ctx.storage.get("config")) as any;

    if (request.method === "GET" && route === "/state") {
      const state = await this.getWorkflowState();
      const nodeExecutions = Array.from(this.ctx.storage.sql.exec("SELECT * FROM node_executions")) as any[];
      return json({ state, executions: nodeExecutions });
    }

    if (request.method === "POST" && route === "/run") {
      // Logic to start or advance the workflow
      let state = await this.getWorkflowState();
      if (!state) {
        await this.updateWorkflowState({ status: 'running', current_node_ids: config?.start_nodes || [], context: {} });
        state = await this.getWorkflowState();
      }

      // Simplistic execution of current nodes
      // In a real DAG, we would handle dependencies, inputs/outputs mapping, etc.
      return json({ ok: true, message: "Workflow execution started/advanced", state });
    }

    return new Response("Not Found in WorkflowHandler", { status: 404 });
  }
}
