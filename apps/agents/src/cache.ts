type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastAccess: number;
  version?: string;
};

export class TtlCache<T> {
  private entries = new Map<string, CacheEntry<T>>();

  constructor(private maxEntries: number) {}

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    entry.lastAccess = Date.now();
    return entry;
  }

  set(key: string, value: T, ttlMs: number, version?: string) {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      lastAccess: Date.now(),
      version,
    });
    this.prune();
  }

  private prune() {
    if (this.entries.size <= this.maxEntries) {
      return;
    }
    const entries = Array.from(this.entries.entries());
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    const removeCount = Math.max(0, this.entries.size - this.maxEntries);
    for (let i = 0; i < removeCount; i += 1) {
      this.entries.delete(entries[i][0]);
    }
  }
}
