import { type RoutingTokenPayload, verifyRoutingToken } from "@axon/shared";

export async function requireRoutingToken(
  request: Request,
  url: URL,
  orchestratorPublicKey: string,
  configId: string,
): Promise<RoutingTokenPayload> {
  const token =
    url.searchParams.get("token") ??
    request.headers.get("x-routing-token");
  if (!token) {
    throw new Error("missing routing token");
  }

  const payload = await verifyRoutingToken(orchestratorPublicKey, token);

  if (payload.config_id !== configId) {
    throw new Error("routing token chat mismatch");
  }

  return payload;
}
