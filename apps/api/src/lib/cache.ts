// Small in-memory TTL cache with a bounded entry count, used by weather.ts/ebird.ts
// to avoid unbounded growth from long-running processes fielding many distinct
// lookup keys (lat/lng pairs, state codes, etc). Eviction is insertion-order
// based (Map preserves insertion order; get() re-inserts to bump recency).

interface CacheEntry<T> {
  data: T
  expiresAt: number // 0 = permanent
}

const DEFAULT_MAX_ENTRIES = 1000

export class BoundedCache<T> {
  private map = new Map<string, CacheEntry<T>>()

  constructor(private maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  get(key: string): T | null {
    const entry = this.map.get(key)
    if (!entry) return null
    if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return null
    }
    // Bump recency for LRU-ish eviction
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.data
  }

  set(key: string, data: T, ttlMs: number): void {
    this.map.delete(key)
    if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value
      if (oldestKey !== undefined) this.map.delete(oldestKey)
    }
    this.map.set(key, { data, expiresAt: ttlMs === 0 ? 0 : Date.now() + ttlMs })
  }
}
