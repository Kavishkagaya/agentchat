type CacheKind = "agent" | "provider" | "secret" | "mcp_server" | "mcp_tools";

const cacheHits: Record<CacheKind, number> = {
  agent: 0,
  provider: 0,
  secret: 0,
  mcp_server: 0,
  mcp_tools: 0,
};

const cacheMisses: Record<CacheKind, number> = {
  agent: 0,
  provider: 0,
  secret: 0,
  mcp_server: 0,
  mcp_tools: 0,
};

const resolutionTimings: Record<string, number[]> = {};
const toolErrors: Record<string, number> = {};

export function recordCacheMetric(kind: CacheKind, hit: boolean) {
  if (hit) {
    cacheHits[kind] += 1;
  } else {
    cacheMisses[kind] += 1;
  }
}

export function recordResolutionMetric(
  name: string,
  durationMs: number,
  success: boolean
) {
  const key = `${name}:${success ? "ok" : "error"}`;
  const existing = resolutionTimings[key] ?? [];
  existing.push(durationMs);
  resolutionTimings[key] = existing;
}

export function recordToolError(toolId: string, error: string) {
  toolErrors[toolId] = (toolErrors[toolId] ?? 0) + 1;
  console.warn("tool_error", { toolId, error });
}

export function snapshotMetrics() {
  return {
    cache_hits: { ...cacheHits },
    cache_misses: { ...cacheMisses },
    resolution_timings: Object.fromEntries(
      Object.entries(resolutionTimings).map(([key, values]) => [
        key,
        {
          count: values.length,
          avg_ms:
            values.reduce((sum, value) => sum + value, 0) /
            Math.max(1, values.length),
        },
      ])
    ),
    tool_errors: { ...toolErrors },
  };
}
