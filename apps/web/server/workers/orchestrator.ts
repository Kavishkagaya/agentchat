import { resolveWorkerBaseUrl } from "./cloudflare";

type GroupActivateRequest = {
  group_id: string;
  org_id: string;
  user_id: string;
};

type GroupActivateResponse = {
  group_controller_id: string;
  session_certificate: string;
};

type RoutingTokenRequest = {
  group_id: string;
  user_id: string;
};

type RoutingTokenResponse = {
  routing_token: string;
};

type OrchestratorClient = {
  activateGroup: (payload: GroupActivateRequest) => Promise<GroupActivateResponse>;
  getRoutingToken: (payload: RoutingTokenRequest) => Promise<RoutingTokenResponse>;
  getGroupHistory: (groupId: string, token: string) => Promise<any>;
};

async function requestOrchestrator<T>(
  path: string, 
  payload?: unknown, 
  method: "POST" | "GET" = "POST",
  headers: Record<string, string> = {}
): Promise<T> {
  // Use explicit URL or resolve (assuming internal network or public if exposed)
  // For dev, might be localhost:8787.
  // resolveWorkerBaseUrl logic might need updating if it assumes something specific.
  const baseUrl = process.env.ORCHESTRATOR_URL || "http://localhost:8787"; 
  
  const options: RequestInit = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  
  if (payload) {
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(`${baseUrl}${path}`, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Orchestrator error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export function getOrchestratorClient(): OrchestratorClient {
  return {
    activateGroup: (payload) => requestOrchestrator<GroupActivateResponse>("/infra/groups", payload),
    getRoutingToken: (payload) => requestOrchestrator<RoutingTokenResponse>("/infra/routing-token", payload),
    getGroupHistory: (groupId, token) => requestOrchestrator<any>(
      `/groups/${groupId}/history`, 
      undefined, 
      "GET", 
      { "X-Routing-Token": token }
    )
  };
}