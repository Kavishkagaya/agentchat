import { eq, getDb, schema } from "@axon/worker-database";
import { TtlCache } from "./cache";
import {
  readLatestVersion,
  readVersionedCache,
  writeVersionedCache,
} from "./cache-store";
import { resolveUpdatedAt } from "./cache-utils";
import { type Env, getTtlMs } from "./env";
import { recordCacheMetric, recordResolutionMetric } from "./telemetry";

const { agentRuntimes, agents } = schema;

export type AgentConfigRecord = {
  agentId: string;
  config: Record<string, unknown>;
  modelId?: string | null;
  orgId: string;
  updatedAt?: string;
  agentName?: string;
};

const MAX_CACHE_ENTRIES = 500;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const configCache = new TtlCache<AgentConfigRecord>(MAX_CACHE_ENTRIES);

function runtimeCacheKey(agentId: string) {
  return `agent:${agentId}`;
}

export async function loadAgentConfig(
  env: Env,
  agentId?: string,
  runtimeId?: string,
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
    where: eq(agents.id, targetAgentId),
  });
  if (!agent) {
    recordResolutionMetric("agent", Date.now() - started, false);
    throw new Error("agent config not found");
  }

  const record: AgentConfigRecord = {
    agentId: targetAgentId,
    config: agent.config,
    modelId: agent.modelId ?? null,
    orgId: agent.orgId,
    updatedAt: resolveUpdatedAt(agent.updatedAt),
    agentName: agent.name,
  };
  // Use stable sentinel "v0" for null updatedAt to avoid cache misses on every fetch
  const version = record.updatedAt ?? "v0";
  configCache.set(cacheKey, record, ttlMs, version);
  await writeVersionedCache(
    env,
    cacheKey,
    version,
    record,
    Math.ceil(ttlMs / 1000),
  );
  recordResolutionMetric("agent", Date.now() - started, true);
  return record;
}
