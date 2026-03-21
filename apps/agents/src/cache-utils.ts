import type { TtlCache } from "./cache";
import {
  readLatestVersion,
  readVersionedCache,
  writeVersionedCache,
} from "./cache-store";
import { type Env, getTtlMs } from "./env";
import { recordCacheMetric, recordResolutionMetric } from "./telemetry";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Normalizes a value to an ISO string version identifier.
 * Used to track cache staleness across L1/L2/DB.
 */
export function resolveUpdatedAt(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}

export type CachedLoaderOptions<T> = {
  cache: TtlCache<T>;
  cacheKeyPrefix: string;
  getVersion: (record: T) => string;
  writeL2: boolean; // false for secrets (security)
  dbFetch: (id: string, orgId: string) => Promise<T | null>;
  cacheKind: "agent" | "model" | "secret" | "mcp_server";
  env: Env;
};

/**
 * Generic L1/L2/DB cache loader factory.
 * Eliminates the copy-pasted pattern from resolution.ts and config.ts.
 *
 * Flow:
 * 1. Check L1 cache + readLatestVersion staleness guard
 * 2. Check L2 cache (KV) + write-back to L1
 * 3. DB fetch + write to L1 + conditional L2 write
 * 4. Record metrics
 */
export function createCachedLoader<T>(
  options: CachedLoaderOptions<T>,
): (id: string, orgId: string) => Promise<T | null> {
  return async (id: string, orgId: string): Promise<T | null> => {
    const {
      cache,
      cacheKeyPrefix,
      getVersion,
      writeL2,
      dbFetch,
      cacheKind,
      env,
    } = options;
    const cacheKey = `${cacheKeyPrefix}:${id}`;
    const ttlMs = getTtlMs(env.AGENT_CONFIG_CACHE_TTL_SECONDS, DEFAULT_TTL_MS);

    // L1 check with staleness guard
    const cached = cache.get(cacheKey);
    if (cached) {
      const latest = await readLatestVersion(env, cacheKey);
      if (!latest || latest === cached.version) {
        recordCacheMetric(cacheKind, true);
        return cached.value;
      }
    }

    // L2 check (KV)
    const l2 = await readVersionedCache<T>(env, cacheKey);
    if (l2) {
      cache.set(cacheKey, l2.value, ttlMs, l2.version);
      recordCacheMetric(cacheKind, true);
      return l2.value;
    }

    // DB fallback
    recordCacheMetric(cacheKind, false);
    const started = Date.now();
    const record = await dbFetch(id, orgId);
    if (!record) {
      recordResolutionMetric(cacheKeyPrefix, Date.now() - started, false);
      return null;
    }

    // Write through to L1 and optionally L2
    const version = getVersion(record);
    cache.set(cacheKey, record, ttlMs, version);
    if (writeL2) {
      await writeVersionedCache(
        env,
        cacheKey,
        version,
        record,
        Math.ceil(ttlMs / 1000),
      );
    }
    recordResolutionMetric(cacheKeyPrefix, Date.now() - started, true);
    return record;
  };
}
