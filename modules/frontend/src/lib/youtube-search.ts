import { isAbortError, signalWithTimeout } from "@/lib/abort-signal"
import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { searchSongsInBrowser } from "@/lib/youtube-search-browser"

export type SongSearchHit = {
  videoId: string
  title: string
  channel: string
  durationSec: number | null
  viewCount?: number
}

export type SongSearchResponse = {
  query: string
  results: SongSearchHit[]
}

export const WORKER_SEARCH_TIMEOUT_MS = 15_000
export const BROWSER_SEARCH_TIMEOUT_MS = 20_000

export function formatSongDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, "0")}`
}

export function formatViewCount(count?: number): string | null {
  if (!count || count <= 0) return null
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B views`
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K views`
  return `${count} views`
}

async function searchSongsViaWorker(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<SongSearchHit[]> {
  const params = new URLSearchParams({ q: query })
  if (options?.limit) params.set("limit", String(options.limit))

  const { signal, cleanup } = signalWithTimeout(WORKER_SEARCH_TIMEOUT_MS, options?.signal)
  try {
    const res = await proxyFetch(`/api/youtube/search?${params}`, { signal })
    if (!res.ok) {
      throw new Error("worker_search_failed")
    }

    const body = (await res.json()) as SongSearchResponse
    return body.results ?? []
  } finally {
    cleanup()
  }
}

export async function searchSongs(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<SongSearchHit[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  try {
    return await searchSongsViaWorker(trimmed, options)
  } catch (err) {
    if (isAbortError(err) || options?.signal?.aborted) throw err
    return searchSongsInBrowser(trimmed, options)
  }
}
