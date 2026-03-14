import {
  type ChatActivateRequestPayload,
  type ChatActivateResponse,
  createAppInfraToken,
  type RoutingTokenRequestPayload,
  type RoutingTokenResponse,
} from "@axon/shared";

export type OrchestratorClient = {
  activateChat: (
    payload: ChatActivateRequestPayload,
    authClaims: { org_id: string; sub: string },
  ) => Promise<ChatActivateResponse>;
  deleteChat: (configId: string) => Promise<{ ok: boolean }>;
  getChatHistory: (configId: string, token: string) => Promise<any>;
  getRoutingToken: (
    payload: RoutingTokenRequestPayload,
    authClaims: { sub: string },
  ) => Promise<RoutingTokenResponse>;
};

async function requestOrchestrator<T>(
  path: string,
  payload: unknown | undefined,
  method: "POST" | "GET" | "DELETE" = "POST",
  headers: Record<string, string> = {},
  authClaims?: { org_id?: string; sub?: string },
): Promise<T> {
  const baseUrl = process.env.ORCHESTRATOR_URL || "http://localhost:8789";

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
    60,
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
    activateChat: (payload, authClaims) =>
      requestOrchestrator<ChatActivateResponse>(
        "/infra/chats",
        payload,
        "POST",
        {},
        authClaims,
      ),
    deleteChat: (configId) =>
      requestOrchestrator<{ ok: boolean }>(
        `/infra/chats/${configId}`,
        undefined,
        "DELETE",
      ),
    getRoutingToken: (payload, authClaims) =>
      requestOrchestrator<RoutingTokenResponse>(
        "/infra/routing-token",
        payload,
        "POST",
        {},
        authClaims,
      ),
    getChatHistory: (configId, token) =>
      requestOrchestrator<any>(`/chats/${configId}/history`, undefined, "GET", {
        "X-Routing-Token": token,
      }),
  };
}
