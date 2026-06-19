import type { SongSearchHit } from "./youtube-search-rank"

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 128

type CacheEntry = {
  results: SongSearchHit[]
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<SongSearchHit[]>>()

export function searchCacheKey(query: string, limit: number): string {
  return `${query.trim().toLowerCase()}::${limit}`
}

function trimCache(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return

  const overflow = cache.size - MAX_CACHE_ENTRIES
  const keys = cache.keys()
  for (let i = 0; i < overflow; i += 1) {
    const key = keys.next().value
    if (!key) break
    cache.delete(key)
  }
}

export function readCachedSearch(key: string): SongSearchHit[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.results
}

export function writeCachedSearch(key: string, results: SongSearchHit[]): void {
  if (results.length === 0) return
  cache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS })
  trimCache()
}

/** Coalesce identical in-flight searches and serve short-lived cached hits. */
export async function withSearchDedup(
  key: string,
  fetcher: () => Promise<SongSearchHit[]>,
): Promise<SongSearchHit[]> {
  const cached = readCachedSearch(key)
  if (cached) return cached

  const existing = inflight.get(key)
  if (existing) return existing

  const promise = fetcher()
    .then((results) => {
      inflight.delete(key)
      writeCachedSearch(key, results)
      return results
    })
    .catch((error) => {
      inflight.delete(key)
      throw error
    })

  inflight.set(key, promise)
  return promise
}

/** Test helper */
export function resetYouTubeSearchCache(): void {
  cache.clear()
  inflight.clear()
}
