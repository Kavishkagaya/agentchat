import type { AgentToolRef, ProviderEnv } from "@axon/agent-factory";
import {
  getMcpServer,
  getProvider,
  getSecretValue,
  listMcpTools,
} from "@axon/database";
import { TtlCache } from "./cache";
import { readLatestVersion, readVersionedCache, writeVersionedCache } from "./cache-store";
import { getTtlMs, type Env } from "./env";
import { recordCacheMetric, recordResolutionMetric } from "./telemetry";

const MAX_CACHE_ENTRIES = 500;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

type ProviderRecord = NonNullable<Awaited<ReturnType<typeof getProvider>>>;

type SecretRecord = NonNullable<Awaited<ReturnType<typeof getSecretValue>>>;

type McpServerRecord = NonNullable<Awaited<ReturnType<typeof getMcpServer>>>;

type McpToolRecord = Awaited<ReturnType<typeof listMcpTools>>[number];

type McpToolRef = {
  serverId: string;
  toolId: string;
  name: string;
};

export type ResolvedMcpTool = {
  id: string;
  serverId: string;
  toolId: string;
  name: string;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
  serverUrl: string;
  token: string;
};

const providerCache = new TtlCache<ProviderRecord>(MAX_CACHE_ENTRIES);
const secretCache = new TtlCache<SecretRecord>(MAX_CACHE_ENTRIES);
const mcpServerCache = new TtlCache<McpServerRecord>(MAX_CACHE_ENTRIES);
const mcpToolsCache = new TtlCache<McpToolRecord[]>(MAX_CACHE_ENTRIES);

function resolveUpdatedAt(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}

async function loadProviderCached(
  env: Env,
  orgId: string,
  providerId: string
): Promise<ProviderRecord | null> {
  const cacheKey = `provider:${providerId}`;
  const ttlMs = getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, DEFAULT_TTL_MS);
  const cached = providerCache.get(cacheKey);
  if (cached) {
    const latest = await readLatestVersion(env, cacheKey);
    if (!latest || latest === cached.version) {
      recordCacheMetric("provider", true);
      return cached.value;
    }
  }

  const l2 = await readVersionedCache<ProviderRecord>(env, cacheKey);
  if (l2) {
    providerCache.set(cacheKey, l2.value, ttlMs, l2.version);
    recordCacheMetric("provider", true);
    return l2.value;
  }

  recordCacheMetric("provider", false);
  const started = Date.now();
  const provider = await getProvider({ orgId, providerId });
  if (!provider) {
    recordResolutionMetric("provider", Date.now() - started, false);
    return null;
  }
  const record: ProviderRecord = provider;
  const version = resolveUpdatedAt(provider.updatedAt) ?? new Date().toISOString();
  providerCache.set(cacheKey, record, ttlMs, version);
  await writeVersionedCache(env, cacheKey, version, record, Math.ceil(ttlMs / 1000));
  recordResolutionMetric("provider", Date.now() - started, true);
  return record;
}

async function loadSecretCached(
  env: Env,
  orgId: string,
  secretId: string
): Promise<SecretRecord | null> {
  const cacheKey = `secret:${secretId}`;
  const ttlMs = getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, DEFAULT_TTL_MS);
  const cached = secretCache.get(cacheKey);
  if (cached) {
    const latest = await readLatestVersion(env, cacheKey);
    if (!latest || latest === cached.version?.toString()) {
      recordCacheMetric("secret", true);
      return cached.value;
    }
  }

  const l2 = await readVersionedCache<SecretRecord>(env, cacheKey);
  if (l2) {
    secretCache.set(cacheKey, l2.value, ttlMs, l2.version);
    recordCacheMetric("secret", true);
    return l2.value;
  }

  recordCacheMetric("secret", false);
  const started = Date.now();
  const secret = await getSecretValue({ orgId, secretId });
  if (!secret) {
    recordResolutionMetric("secret", Date.now() - started, false);
    return null;
  }
  const version = secret.version?.toString() ?? "1";
  secretCache.set(cacheKey, secret, ttlMs, version);
  await writeVersionedCache(env, cacheKey, version, secret, Math.ceil(ttlMs / 1000));
  recordResolutionMetric("secret", Date.now() - started, true);
  return secret;
}

async function loadMcpServerCached(
  env: Env,
  orgId: string,
  serverId: string
): Promise<McpServerRecord | null> {
  const cacheKey = `mcp-server:${serverId}`;
  const ttlMs = getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, DEFAULT_TTL_MS);
  const cached = mcpServerCache.get(cacheKey);
  if (cached) {
    const latest = await readLatestVersion(env, cacheKey);
    if (!latest || latest === cached.version) {
      recordCacheMetric("mcp_server", true);
      return cached.value;
    }
  }

  const l2 = await readVersionedCache<McpServerRecord>(env, cacheKey);
  if (l2) {
    mcpServerCache.set(cacheKey, l2.value, ttlMs, l2.version);
    recordCacheMetric("mcp_server", true);
    return l2.value;
  }

  recordCacheMetric("mcp_server", false);
  const started = Date.now();
  const server = await getMcpServer({ orgId, serverId });
  if (!server) {
    recordResolutionMetric("mcp_server", Date.now() - started, false);
    return null;
  }
  const record: McpServerRecord = server;
  const version =
    resolveUpdatedAt(server.updatedAt) ??
    resolveUpdatedAt(server.lastValidatedAt) ??
    new Date().toISOString();
  mcpServerCache.set(cacheKey, record, ttlMs, version);
  await writeVersionedCache(env, cacheKey, version, record, Math.ceil(ttlMs / 1000));
  recordResolutionMetric("mcp_server", Date.now() - started, true);
  return record;
}

async function loadMcpToolsCached(
  env: Env,
  serverId: string,
  versionHint?: string
): Promise<McpToolRecord[]> {
  const cacheKey = `mcp-tools:${serverId}`;
  const ttlMs = getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, DEFAULT_TTL_MS);
  const cached = mcpToolsCache.get(cacheKey);
  if (cached) {
    const latest = await readLatestVersion(env, cacheKey);
    if (!latest || latest === cached.version || latest === versionHint) {
      recordCacheMetric("mcp_tools", true);
      return cached.value;
    }
  }

  const l2 = await readVersionedCache<McpToolRecord[]>(env, cacheKey);
  if (l2) {
    mcpToolsCache.set(cacheKey, l2.value, ttlMs, l2.version);
    recordCacheMetric("mcp_tools", true);
    return l2.value;
  }

  recordCacheMetric("mcp_tools", false);
  const started = Date.now();
  const tools = await listMcpTools(serverId);
  const version = versionHint ?? new Date().toISOString();
  mcpToolsCache.set(cacheKey, tools, ttlMs, version);
  await writeVersionedCache(env, cacheKey, version, tools, Math.ceil(ttlMs / 1000));
  recordResolutionMetric("mcp_tools", Date.now() - started, true);
  return tools;
}

function extractMcpToolRefs(rawTools: unknown): McpToolRef[] {
  if (!Array.isArray(rawTools)) {
    return [];
  }
  return rawTools
    .map((tool) => {
      if (!tool || typeof tool !== "object") {
        return null;
      }
      const candidate = tool as Record<string, unknown>;
      if (
        typeof candidate.serverId === "string" &&
        typeof candidate.toolId === "string" &&
        typeof candidate.name === "string"
      ) {
        return {
          serverId: candidate.serverId,
          toolId: candidate.toolId,
          name: candidate.name,
        } satisfies McpToolRef;
      }
      return null;
    })
    .filter((tool): tool is McpToolRef => Boolean(tool));
}

function extractAgentToolRefs(rawTools: unknown): AgentToolRef[] {
  if (!Array.isArray(rawTools)) {
    return [];
  }
  const refs: AgentToolRef[] = [];
  for (const tool of rawTools) {
    if (!tool || typeof tool !== "object") {
      continue;
    }
    const candidate = tool as Record<string, unknown>;
    if (typeof candidate.id !== "string") {
      continue;
    }
    refs.push({
      id: candidate.id,
      name: typeof candidate.name === "string" ? candidate.name : undefined,
      description:
        typeof candidate.description === "string"
          ? candidate.description
          : undefined,
      parameters:
        candidate.parameters && typeof candidate.parameters === "object"
          ? (candidate.parameters as Record<string, unknown>)
          : undefined,
      config:
        candidate.config && typeof candidate.config === "object"
          ? (candidate.config as Record<string, unknown>)
          : undefined,
    });
  }
  return refs;
}

export async function resolveTooling(
  env: Env,
  orgId: string,
  rawTools: unknown
): Promise<{ toolRefs: AgentToolRef[]; mcpTools: ResolvedMcpTool[] }> {
  const mcpToolRefs = extractMcpToolRefs(rawTools);
  const directToolRefs = extractAgentToolRefs(rawTools);

  if (mcpToolRefs.length === 0) {
    return { toolRefs: directToolRefs, mcpTools: [] };
  }

  const refsByServer = new Map<string, McpToolRef[]>();
  for (const ref of mcpToolRefs) {
    const existing = refsByServer.get(ref.serverId);
    if (existing) {
      existing.push(ref);
    } else {
      refsByServer.set(ref.serverId, [ref]);
    }
  }

  const resolvedTools: ResolvedMcpTool[] = [];
  const toolRefs: AgentToolRef[] = [...directToolRefs];

  for (const [serverId, refs] of refsByServer.entries()) {
    const server = await loadMcpServerCached(env, orgId, serverId);
    if (!server || server.status !== "valid") {
      continue;
    }

    let token = server.token ?? "";
    if (server.secretRef) {
      const secret = await loadSecretCached(env, orgId, server.secretRef);
      if (!secret) {
        continue;
      }
      token = secret.value;
    }

    if (!token) {
      continue;
    }

    const versionHint =
      resolveUpdatedAt(server.lastValidatedAt) ??
      resolveUpdatedAt(server.updatedAt);
    const availableTools = await loadMcpToolsCached(env, server.id, versionHint);
    const allowedIds = new Set(refs.map((ref) => ref.toolId));

    for (const tool of availableTools) {
      if (!allowedIds.has(tool.toolId)) {
        continue;
      }
      const toolId = `mcp:${server.id}:${tool.toolId}`;
      resolvedTools.push({
        id: toolId,
        serverId: server.id,
        toolId: tool.toolId,
        name: tool.name,
        description: tool.description ?? undefined,
        inputSchema: (tool.inputSchema as Record<string, unknown> | null) ?? undefined,
        serverUrl: server.url,
        token,
      });
      toolRefs.push({
        id: toolId,
        name: tool.name,
        description: tool.description ?? undefined,
        parameters:
          (tool.inputSchema as Record<string, unknown> | null) ?? undefined,
      });
    }
  }

  return { toolRefs, mcpTools: resolvedTools };
}

export async function resolveProviderEnv(
  env: Env,
  orgId: string,
  providerId?: string | null
): Promise<{ providerEnv: ProviderEnv; providerType?: string; modelId?: string }>{
  let providerEnv: ProviderEnv = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  };

  if (!providerId) {
    return { providerEnv };
  }

  const provider = await loadProviderCached(env, orgId, providerId);
  if (!provider) {
    throw new Error("provider not found for agent");
  }
  if (!provider.secretRef) {
    throw new Error("provider secret is not configured");
  }
  const secret = await loadSecretCached(env, orgId, provider.secretRef);
  if (!secret) {
    throw new Error("provider secret not found");
  }

  if (provider.providerType === "cloudflare_ai_gateway") {
    providerEnv = {
      ...providerEnv,
      CLOUDFLARE_AIG_TOKEN: env.CLOUDFLARE_AIG_TOKEN,
      CLOUDFLARE_AIG_ACCOUNT_ID: provider.gatewayAccountId,
      CLOUDFLARE_AIG_GATEWAY_ID: provider.gatewayId,
      CLOUDFLARE_PROVIDER_KEY: secret.value,
      CLOUDFLARE_PROVIDER_KIND: provider.kind,
    };
  } else {
    providerEnv = {
      ...providerEnv,
      PROVIDER_API_KEY: secret.value,
    };
  }

  return { providerEnv, providerType: provider.providerType, modelId: provider.modelId };
}
