import type { Env } from "../index";

export class WorkflowHandler {
  constructor(_ctx: DurableObjectState, _env: Env) {}

  async ensureSchema() {
    // TODO: implement when workflow is in scope
  }

  async handle(_request: Request, _route: string): Promise<Response> {
    return new Response(
      JSON.stringify({ ok: false, error: "workflow not implemented" }),
      {
        status: 501,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
