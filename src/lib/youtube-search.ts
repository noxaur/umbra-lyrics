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

  const res = await proxyFetch(`/api/youtube/search?${params}`, { signal: options?.signal })
  if (!res.ok) {
    throw new Error("worker_search_failed")
  }

  const body = (await res.json()) as SongSearchResponse
  return body.results ?? []
}

export async function searchSongs(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<SongSearchHit[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  try {
    return await searchSongsViaWorker(trimmed, options)
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    return searchSongsInBrowser(trimmed, options)
  }
}
