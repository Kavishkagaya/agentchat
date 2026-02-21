import type { Env } from "./env";
import { getDb } from "./db";
import { TtlCache } from "./cache";

export type AgentConfigRecord = {
  agentId: string;
  config: Record<string, unknown>;
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

export async function loadAgentConfig(env: Env, agentId?: string, runtimeId?: string): Promise<AgentConfigRecord> {
  const db = getDb(env);

  if (runtimeId) {
    const runtime = await db.query.agentRuntimes.findFirst({
      where: (agentRuntimesTable, { eq }) => eq(agentRuntimesTable.runtimeId, runtimeId)
    });
    if (!runtime) {
      throw new Error("agent runtime not found");
    }
    agentId = runtime.agentId;
  }

  if (!agentId) {
    throw new Error("missing agent_id");
  }

  const cached = configCache.get(agentId);
  if (cached) {
    return cached.value;
  }

  const agent = await db.query.agents.findFirst({
    where: (agentsTable, { eq }) => eq(agentsTable.agentId, agentId)
  });
  if (!agent) {
    throw new Error("agent config not found");
  }

  const record: AgentConfigRecord = {
    agentId,
    config: agent.config as Record<string, unknown>,
    updatedAt: resolveUpdatedAt(agent.updatedAt)
  };
  configCache.set(agentId, record, DEFAULT_TTL_MS, record.updatedAt);
  return record;
}
