import type { Env } from "./env";

export type CacheRecord<T> = {
  value: T;
  version: string;
};

export async function readVersionedCache<T>(
  env: Env,
  baseKey: string,
): Promise<CacheRecord<T> | undefined> {
  if (!env.AGENTS_KV) {
    return undefined;
  }
  const version = await env.AGENTS_KV.get(`${baseKey}:latest`);
  if (!version) {
    return undefined;
  }
  const raw = await env.AGENTS_KV.get(`${baseKey}:v:${version}`);
  if (!raw) {
    return undefined;
  }
  try {
    const value = JSON.parse(raw) as T;
    return { value, version };
  } catch (error) {
    console.error(
      `[Cache] JSON parse error for key ${baseKey}:v:${version}:`,
      error,
    );
    return undefined;
  }
}

export async function writeVersionedCache<T>(
  env: Env,
  baseKey: string,
  version: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (!env.AGENTS_KV) {
    return;
  }
  const payload = JSON.stringify(value);
  // Write :latest pointer first. If we crash between writes, :latest pointing to a non-existent
  // key is safer than having the data but an outdated pointer.
  await env.AGENTS_KV.put(`${baseKey}:latest`, version, {
    expirationTtl: ttlSeconds,
  });
  await env.AGENTS_KV.put(`${baseKey}:v:${version}`, payload, {
    expirationTtl: ttlSeconds,
  });
}

export async function readLatestVersion(env: Env, baseKey: string) {
  if (!env.AGENTS_KV) {
    return undefined;
  }
  return await env.AGENTS_KV.get(`${baseKey}:latest`);
}
