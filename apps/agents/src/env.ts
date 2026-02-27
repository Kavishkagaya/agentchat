export interface Env {
  AGENT_CONFIG_CACHE_TTL_SECONDS?: string;
  AGENTS_KV?: KVNamespace;
  CLOUDFLARE_AIG_TOKEN?: string;
  ENVIRONMENT: string;
  NEON_DATABASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ORCHESTRATOR_PUBLIC_KEY?: string;
}

export function getTtlMs(value: string | undefined, fallbackMs: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed * 1000;
  }
  return fallbackMs;
}
