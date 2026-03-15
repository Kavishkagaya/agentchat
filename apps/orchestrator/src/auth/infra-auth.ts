import { type AppInfraTokenPayload, verifyAppInfraToken } from "@axon/shared";
import type { Env } from "../env";
import { getBearerToken } from "../http/request";

export async function requireAppSignature(
  request: Request,
  env: Env,
  path: string,
): Promise<AppInfraTokenPayload> {
  const token = getBearerToken(request);
  return verifyAppInfraToken(env.APP_PUBLIC_KEY, token, {
    method: request.method,
    path,
  });
}
