import { resolveWorkerBaseUrl } from "./cloudflare";

type SandboxCreateRequest = {
  chat_id: string;
  template_id?: string;
  resources?: Record<string, unknown>;
  env_profile?: Record<string, unknown>;
  idempotency_key: string;
};

type SandboxCreateResponse = {
  sandbox_id: string;
  status: "starting" | "running" | "stopped" | "error";
  preview_host: string;
  sandbox_epoch?: number;
};

type OrchestratorClient = {
  createSandbox: (payload: SandboxCreateRequest) => Promise<SandboxCreateResponse>;
  createAgentRuntime: (payload: AgentRuntimeCreateRequest) => Promise<AgentRuntimeCreateResponse>;
};

type AgentRuntimeCreateRequest = {
  chat_id: string;
  agent_id: string;
  agent: Record<string, unknown>;
};

type AgentRuntimeCreateResponse = {
  runtime_id: string;
  status: string;
  base_url: string;
};

async function requestOrchestrator<T>(path: string, payload: unknown): Promise<T> {
  const baseUrl = await resolveWorkerBaseUrl("orchestrator");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Orchestrator error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export function getOrchestratorClient(): OrchestratorClient {
  return {
    createSandbox: (payload) => requestOrchestrator<SandboxCreateResponse>("/infra/sandboxes", payload),
    createAgentRuntime: (payload) =>
      requestOrchestrator<AgentRuntimeCreateResponse>("/infra/agents", payload)
  };
}
