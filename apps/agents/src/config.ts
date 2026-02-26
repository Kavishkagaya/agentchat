import { db, schema } from "@axon/database";
import { eq } from "drizzle-orm";
import { TtlCache } from "./cache";
import type { Env } from "./env";

export type AgentConfigRecord = {
  agentId: string;
  orgId: string;
  providerId?: string | null;
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

export async function loadAgentConfig(
  env: Env,
  agentId?: string,
  runtimeId?: string
): Promise<AgentConfigRecord> {
  let targetAgentId = agentId;

  if (runtimeId) {
    const runtime = await db.query.agentRuntimes.findFirst({
      where: eq(schema.agentRuntimes.id, runtimeId),
    });
    if (!runtime) {
      throw new Error("agent runtime not found");
    }
    targetAgentId = runtime.agentId;
  }

  if (!targetAgentId) {
    throw new Error("missing agent_id");
  }

  const cached = configCache.get(targetAgentId);
  if (cached) {
    return cached.value;
  }

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, targetAgentId),
  });
  if (!agent) {
    throw new Error("agent config not found");
  }

  const record: AgentConfigRecord = {
    agentId: targetAgentId,
    orgId: agent.orgId,
    providerId: agent.providerId ?? null,
    config: agent.config as Record<string, unknown>,
    updatedAt: resolveUpdatedAt(agent.updatedAt),
  };
  configCache.set(targetAgentId, record, DEFAULT_TTL_MS, record.updatedAt);
  return record;
}
