import { createAppInfraToken } from "@axon/shared";

type GroupActivateRequest = {
  group_id: string;
  org_id: string;
  user_id: string;
  history_mode?: "internal" | "external";
};

type GroupActivateResponse = {
  group_controller_id: string;
};

type RoutingTokenRequest = {
  group_id: string;
  user_id: string;
};

type RoutingTokenResponse = {
  routing_token: string;
};

type OrchestratorClient = {
  activateGroup: (
    payload: GroupActivateRequest
  ) => Promise<GroupActivateResponse>;
  getRoutingToken: (
    payload: RoutingTokenRequest
  ) => Promise<RoutingTokenResponse>;
  getGroupHistory: (groupId: string, token: string) => Promise<any>;
};

async function requestOrchestrator<T>(
  path: string,
  payload: unknown | undefined,
  method: "POST" | "GET" = "POST",
  headers: Record<string, string> = {},
  authClaims?: { org_id?: string; sub?: string }
): Promise<T> {
  // Use explicit URL or resolve (assuming internal network or public if exposed)
  // For dev, might be localhost:8787.
  // resolveWorkerBaseUrl logic might need updating if it assumes something specific.
  const baseUrl = process.env.ORCHESTRATOR_URL || "http://localhost:8787";

  const requestHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };

  const appPrivateKey = process.env.APP_PRIVATE_KEY;
  if (!appPrivateKey) {
    throw new Error("APP_PRIVATE_KEY is not configured");
  }
  const infraToken = await createAppInfraToken(
    appPrivateKey,
    {
      method,
      path,
      org_id: authClaims?.org_id,
      sub: authClaims?.sub ?? "web-app",
    },
    60
  );
  requestHeaders.authorization = `Bearer ${infraToken}`;

  const options: RequestInit = {
    method,
    headers: requestHeaders,
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
    activateGroup: (payload) =>
      requestOrchestrator<GroupActivateResponse>(
        "/infra/groups",
        payload,
        "POST",
        {},
        { org_id: payload.org_id, sub: payload.user_id }
      ),
    getRoutingToken: (payload) =>
      requestOrchestrator<RoutingTokenResponse>(
        "/infra/routing-token",
        payload,
        "POST",
        {},
        { sub: payload.user_id }
      ),
    getGroupHistory: (groupId, token) =>
      requestOrchestrator<any>(
        `/groups/${groupId}/history`,
        undefined,
        "GET",
        { "X-Routing-Token": token }
      ),
  };
}
