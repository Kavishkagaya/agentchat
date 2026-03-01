export interface Env {
  AGENT_CONFIG_CACHE_TTL_SECONDS?: string;
  AGENTS_KV?: KVNamespace;
  CLOUDFLARE_AIG_TOKEN?: string;
  DATABASE_URL?: string;
  ENVIRONMENT: string;
  GC_PUBLIC_KEY: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ORCHESTRATOR_PUBLIC_KEY?: string;
  SECRETS_ENCRYPTION_KEY: string;
}

export function getTtlMs(value: string | undefined, fallbackMs: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed * 1000;
  }
  return fallbackMs;
}

export function validateEnv(env: Env): void {
  if (!env.GC_PUBLIC_KEY) {
    throw new Error(
      "Missing required env var: GC_PUBLIC_KEY. " +
      "Set this to the base64-encoded Ed25519 public key of the Group Controller."
    );
  }
  if (!env.DATABASE_URL) {
    throw new Error(
      "Missing required env var: DATABASE_URL. " +
      "Set this to the Postgres connection string."
    );
  }
}
