import type { Sandbox } from "@cloudflare/sandbox";

export interface Env {
  ENVIRONMENT: string;
  DATABASE_URL: string;

  // Cache Configuration
  AGENTS_KV?: KVNamespace;
  AGENT_CONFIG_CACHE_TTL_SECONDS?: string;

  // Sandbox Durable Object
  Sandbox: DurableObjectNamespace<Sandbox>;

  // Secrete keys and tokens
  ORCHESTRATOR_PUBLIC_KEY?: string;
  GC_PUBLIC_KEY: string;
  SECRETS_ENCRYPTION_KEY: string;

  // Cloudflare AIG integration
  CLOUDFLARE_AIG_TOKEN: string;
  CLOUDFLARE_AIG_ACCOUNT_ID: string;
  CLOUDFLARE_AIG_GATEWAY_ID: string;
}

export function getTtlMs(value: string | undefined, fallbackMs: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed * 1000;
  }
  return fallbackMs;
}

const keyErrorMessage = (key: string) => {
  switch (key) {
    case "AGENT_CONFIG_CACHE_TTL_SECONDS":
      return `Invalid ${key}: must be a positive number representing seconds.`;
    case "ENVIRONMENT":
      return `Invalid ${key}: must be one of "development", "staging", or "production".`;
    case "GC_PUBLIC_KEY":
      return `Invalid ${key}: must be a non-empty string.`;
    case "SECRETS_ENCRYPTION_KEY":
      return `Invalid ${key}: must be a non-empty string.`;
    default:
      return `Invalid ${key}`;
  }
};

export function validateEnv(env: Env): void {
  const requiredKeys: (keyof Env)[] = [
    "ENVIRONMENT",
    "DATABASE_URL",
    "GC_PUBLIC_KEY",
    "SECRETS_ENCRYPTION_KEY",
    "CLOUDFLARE_AIG_TOKEN",
    "CLOUDFLARE_AIG_ACCOUNT_ID",
    "CLOUDFLARE_AIG_GATEWAY_ID",
  ];

  for (const key of requiredKeys) {
    const value = env[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(keyErrorMessage(key));
    }
  }

  const validEnvironments = ["development", "staging", "production"];
  if (!validEnvironments.includes(env.ENVIRONMENT)) {
    throw new Error(keyErrorMessage("ENVIRONMENT"));
  }

  if (
    env.AGENT_CONFIG_CACHE_TTL_SECONDS !== undefined &&
    getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, -1) <= 0
  ) {
    throw new Error(keyErrorMessage("AGENT_CONFIG_CACHE_TTL_SECONDS"));
  }

  if (!env.Sandbox) {
    throw new Error("Sandbox DurableObject binding is not configured");
  }
}
