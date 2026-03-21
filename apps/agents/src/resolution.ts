import type { ModelEnv } from "@axon/agent-factory";
import type { ResolvedMcpServer } from "@axon/shared";
import { getMcpServer, getModel, getSecretValue } from "@axon/worker-database";
import { TtlCache } from "./cache";
import { createCachedLoader, resolveUpdatedAt } from "./cache-utils";
import type { Env } from "./env";

const MAX_CACHE_ENTRIES = 500;

type ModelRecord = NonNullable<Awaited<ReturnType<typeof getModel>>>;

type SecretRecord = NonNullable<Awaited<ReturnType<typeof getSecretValue>>>;

type McpServerRecord = NonNullable<Awaited<ReturnType<typeof getMcpServer>>>;

const modelCache = new TtlCache<ModelRecord>(MAX_CACHE_ENTRIES);
const secretCache = new TtlCache<SecretRecord>(MAX_CACHE_ENTRIES);
const mcpServerCache = new TtlCache<McpServerRecord>(MAX_CACHE_ENTRIES);

// Create cached loaders for each entity type
const loadModelCached = (env: Env) =>
  createCachedLoader<ModelRecord>({
    cache: modelCache,
    cacheKeyPrefix: "model",
    writeL2: true,
    dbFetch: async (id, orgId) =>
      (await getModel({ orgId, providerId: id })) ?? null,
    getVersion: (m) => resolveUpdatedAt(m.updatedAt) ?? "v0",
    cacheKind: "model",
    env,
  });

const loadSecretCached = (env: Env) =>
  createCachedLoader<SecretRecord>({
    cache: secretCache,
    cacheKeyPrefix: "secret",
    writeL2: false, // SECURITY: never persist secrets to KV
    dbFetch: async (id, orgId) =>
      (await getSecretValue({
        orgId,
        secretId: id,
        encryptionKey: env.SECRETS_ENCRYPTION_KEY,
      })) ?? null,
    getVersion: (s) => s.version?.toString() ?? "1",
    cacheKind: "secret",
    env,
  });

const loadMcpServerCached = (env: Env) =>
  createCachedLoader<McpServerRecord>({
    cache: mcpServerCache,
    cacheKeyPrefix: "mcp-server",
    writeL2: true,
    dbFetch: async (id, orgId) =>
      (await getMcpServer({ orgId, serverId: id })) ?? null,
    getVersion: (s) =>
      resolveUpdatedAt(s.updatedAt) ??
      resolveUpdatedAt(s.lastValidatedAt) ??
      "v0",
    cacheKind: "mcp_server",
    env,
  });

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

function extractSandboxToolIds(rawConfig: unknown): string[] {
  if (!rawConfig || typeof rawConfig !== "object") {
    return [];
  }
  const config = rawConfig as Record<string, unknown>;
  if (!Array.isArray(config.sandboxTools)) {
    return [];
  }
  return config.sandboxTools.filter(
    (id): id is string => typeof id === "string",
  );
}

export async function resolveMcpServers(
  env: Env,
  orgId: string,
  serverIds: string[],
): Promise<ResolvedMcpServer[]> {
  const servers: ResolvedMcpServer[] = [];
  const loadServer = loadMcpServerCached(env);
  const loadSecret = loadSecretCached(env);

  for (const serverId of serverIds) {
    const server = await loadServer(serverId, orgId);
    if (!server || server.status !== "valid") {
      console.warn(
        `[MCP] Skipping server ${serverId}: status=${server?.status ?? "not found"}`,
      );
      continue;
    }

    let token = server.token ?? "";
    if (server.secretRef) {
      const secret = await loadSecret(server.secretRef, orgId);
      if (!secret) {
        console.warn(
          `[MCP] Skipping server ${serverId}: secretRef="${server.secretRef}" resolved to null`,
        );
        continue;
      }
      token = secret.value;
    }

    if (!token) {
      console.warn(`[MCP] Skipping server ${serverId}: no token available`);
      continue;
    }

    servers.push({
      serverId: server.id,
      url: server.url,
      token,
    });
  }

  return servers;
}

export async function resolveTooling(
  rawConfig: unknown,
): Promise<{ sandboxToolIds: string[]; mcpServerIds: string[] }> {
  const mcpServerIds = extractMcpServerIds(rawConfig);
  const sandboxToolIds = extractSandboxToolIds(rawConfig);

  return { sandboxToolIds, mcpServerIds };
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
  modelId?: string | null,
): Promise<{ modelEnv: ModelEnv; modelType?: string; modelId?: string }> {
  let modelEnv: ModelEnv = {};

  if (!modelId) {
    throw new Error("modelId is required for agent execution");
  }

  const loadModel = loadModelCached(env);
  const loadSecret = loadSecretCached(env);

  const model = await loadModel(modelId, orgId);
  if (!model) {
    throw new Error("model not found for agent");
  }
  if (!model.secretRef) {
    throw new Error("model secret is not configured");
  }
  const secret = await loadSecret(model.secretRef, orgId);
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
