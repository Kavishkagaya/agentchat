import type { Env } from "../index";

export class WorkflowHandler {
  // ctx and env are intentionally unused — workflow is not yet implemented
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  async ensureSchema(): Promise<void> {
    // No-op until workflow is implemented
  }

  async handle(_request: Request, _route: string): Promise<Response> {
    return new Response(
      JSON.stringify({ ok: false, error: "workflow not implemented" }),
      {
        status: 501,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
