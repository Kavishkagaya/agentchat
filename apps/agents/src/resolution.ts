import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { AgentToolRef, ModelEnv } from "@axon/agent-factory";
import {
  getMcpServer,
  getModel,
  getSecretValue,
} from "@axon/database";
import { TtlCache } from "./cache";
import { readLatestVersion, readVersionedCache, writeVersionedCache } from "./cache-store";
import { getTtlMs, type Env } from "./env";
import { recordCacheMetric, recordResolutionMetric } from "./telemetry";

const MAX_CACHE_ENTRIES = 500;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

type ModelRecord = NonNullable<Awaited<ReturnType<typeof getModel>>>;

type SecretRecord = NonNullable<Awaited<ReturnType<typeof getSecretValue>>>;

type McpServerRecord = NonNullable<Awaited<ReturnType<typeof getMcpServer>>>;


export type ResolvedMcpTool = {
  description?: string | null;
  id: string;
  inputSchema?: Record<string, unknown> | null;
  name: string;
  serverId: string;
  serverUrl: string;
  token: string;
  toolId: string;
};

const modelCache = new TtlCache<ModelRecord>(MAX_CACHE_ENTRIES);
const secretCache = new TtlCache<SecretRecord>(MAX_CACHE_ENTRIES);
const mcpServerCache = new TtlCache<McpServerRecord>(MAX_CACHE_ENTRIES);

function resolveUpdatedAt(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}

async function loadModelCached(
  env: Env,
  orgId: string,
  id: string
): Promise<ModelRecord | null> {
  const cacheKey = `model:${id}`;
  const ttlMs = getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, DEFAULT_TTL_MS);
  const cached = modelCache.get(cacheKey);
  if (cached) {
    const latest = await readLatestVersion(env, cacheKey);
    if (!latest || latest === cached.version) {
      recordCacheMetric("model", true);
      return cached.value;
    }
  }

  const l2 = await readVersionedCache<ModelRecord>(env, cacheKey);
  if (l2) {
    modelCache.set(cacheKey, l2.value, ttlMs, l2.version);
    recordCacheMetric("model", true);
    return l2.value;
  }

  recordCacheMetric("model", false);
  const started = Date.now();
  const model = await getModel({ orgId, id });
  if (!model) {
    recordResolutionMetric("model", Date.now() - started, false);
    return null;
  }
  const record: ModelRecord = model;
  const version = resolveUpdatedAt(model.updatedAt) ?? new Date().toISOString();
  modelCache.set(cacheKey, record, ttlMs, version);
  await writeVersionedCache(env, cacheKey, version, record, Math.ceil(ttlMs / 1000));
  recordResolutionMetric("model", Date.now() - started, true);
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
  // NOTE: secret.value is already decrypted plaintext. L2 cache stores plaintext intentionally
  // for agent runtime performance. Do NOT call decryptSecretValue() on values read from cache.
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

async function fetchMcpToolsLive(
  url: string,
  token: string,
): Promise<Array<{ toolId: string; name: string; description: string | null; inputSchema: Record<string, unknown> | null }>> {
  const client = new Client({ name: "AgentChat", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      } as HeadersInit,
    },
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.map((tool) => ({
      toolId: tool.name,
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: (tool.inputSchema as Record<string, unknown>) ?? null,
    }));
  } finally {
    await transport.close();
  }
}

function extractMcpServerIds(rawConfig: unknown): string[] {
  if (!rawConfig || typeof rawConfig !== "object") {
    return [];
  }
  const config = rawConfig as Record<string, unknown>;
  if (!Array.isArray(config.mcpServers)) {
    return [];
  }
  return config.mcpServers.filter((id): id is string => typeof id === "string");
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
  rawConfig: unknown,
): Promise<{ toolRefs: AgentToolRef[]; mcpTools: ResolvedMcpTool[] }> {
  const mcpServerIds = extractMcpServerIds(rawConfig);
  const directToolRefs = extractAgentToolRefs(rawConfig);

  if (mcpServerIds.length === 0) {
    return { toolRefs: directToolRefs, mcpTools: [] };
  }

  const resolvedTools: ResolvedMcpTool[] = [];
  const toolRefs: AgentToolRef[] = [...directToolRefs];

  for (const serverId of mcpServerIds) {
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

    const tools = await fetchMcpToolsLive(server.url, token);
    for (const tool of tools) {
      const toolId = `mcp:${server.id}:${tool.toolId}`;
      resolvedTools.push({
        id: toolId,
        serverId: server.id,
        toolId: tool.toolId,
        name: tool.name,
        description: tool.description ?? undefined,
        inputSchema: tool.inputSchema ?? undefined,
        serverUrl: server.url,
        token,
      });
      toolRefs.push({
        id: toolId,
        name: tool.name,
        description: tool.description ?? undefined,
        parameters: tool.inputSchema ?? undefined,
      });
    }
  }

  return { toolRefs, mcpTools: resolvedTools };
}

function resolveApiKeyEnvVar(kind: string | null | undefined): string {
  switch (kind) {
    case "openai":
      return "OPENAI_API_KEY";
    default:
      return "PROVIDER_API_KEY";
  }
}

export async function resolveModelEnv(
  env: Env,
  orgId: string,
  modelId?: string | null
): Promise<{ modelEnv: ModelEnv; modelType?: string; modelId?: string }>{
  let modelEnv: ModelEnv = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  };

  if (!modelId) {
    return { modelEnv };
  }

  const model = await loadModelCached(env, orgId, modelId);
  if (!model) {
    throw new Error("model not found for agent");
  }
  if (!model.secretRef) {
    throw new Error("model secret is not configured");
  }
  const secret = await loadSecretCached(env, orgId, model.secretRef);
  if (!secret) {
    throw new Error("model secret not found");
  }

  if (model.modelType === "cloudflare_ai_gateway") {
    modelEnv = {
      ...modelEnv,
      CLOUDFLARE_AIG_TOKEN: env.CLOUDFLARE_AIG_TOKEN,
      CLOUDFLARE_AIG_ACCOUNT_ID: model.gatewayAccountId,
      CLOUDFLARE_AIG_GATEWAY_ID: model.gatewayId,
      CLOUDFLARE_PROVIDER_KEY: secret.value,
      CLOUDFLARE_PROVIDER_KIND: model.kind,
    };
  } else {
    const apiKeyVar = resolveApiKeyEnvVar(model.kind);
    modelEnv = {
      ...modelEnv,
      [apiKeyVar]: secret.value,
    };
  }

  return { modelEnv, modelType: model.modelType, modelId: model.modelId };
}
