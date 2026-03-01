import { getDb, schema } from "@axon/database";
import { eq } from "drizzle-orm";
import { TtlCache } from "./cache";
import { readLatestVersion, readVersionedCache, writeVersionedCache } from "./cache-store";
import { getTtlMs, type Env } from "./env";
import { recordCacheMetric, recordResolutionMetric } from "./telemetry";

export type AgentConfigRecord = {
  agentId: string;
  config: Record<string, unknown>;
  modelId?: string | null;
  orgId: string;
  updatedAt?: string;
};

const MAX_CACHE_ENTRIES = 500;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const configCache = new TtlCache<AgentConfigRecord>(MAX_CACHE_ENTRIES);

function resolveUpdatedAt(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}

function runtimeCacheKey(agentId: string) {
  return `agent:${agentId}`;
}

export async function loadAgentConfig(
  env: Env,
  agentId?: string,
  runtimeId?: string
): Promise<AgentConfigRecord> {
  let targetAgentId = agentId;

  if (runtimeId) {
    const db = getDb();
    const runtime = await db.query.agentRuntimes.findFirst({
      where: eq(agentRuntimes.id, runtimeId),
    });
    if (!runtime) {
      throw new Error("agent runtime not found");
    }
    targetAgentId = runtime.agentId;
  }

  if (!targetAgentId) {
    throw new Error("missing agent_id");
  }

  const ttlMs = getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, DEFAULT_TTL_MS);
  const cacheKey = runtimeCacheKey(targetAgentId);
  const cached = configCache.get(cacheKey);

  if (cached) {
    const latest = await readLatestVersion(env, cacheKey);
    if (!latest || latest === cached.version) {
      recordCacheMetric("agent", true);
      return cached.value;
    }
  }

  const l2 = await readVersionedCache<AgentConfigRecord>(env, cacheKey);
  if (l2) {
    configCache.set(cacheKey, l2.value, ttlMs, l2.version);
    recordCacheMetric("agent", true);
    return l2.value;
  }

  recordCacheMetric("agent", false);
  const started = Date.now();
  const db = getDb();
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, targetAgentId),
  });
  if (!agent) {
    recordResolutionMetric("agent", Date.now() - started, false);
    throw new Error("agent config not found");
  }

  const record: AgentConfigRecord = {
    agentId: targetAgentId,
    config: agent.config as Record<string, unknown>,
    modelId: agent.modelId ?? null,
    orgId: agent.orgId,
    updatedAt: resolveUpdatedAt(agent.updatedAt),
  };
  const version = record.updatedAt ?? new Date().toISOString();
  configCache.set(cacheKey, record, ttlMs, version);
  await writeVersionedCache(env, cacheKey, version, record, Math.ceil(ttlMs / 1000));
  recordResolutionMetric("agent", Date.now() - started, true);
  return record;
}
