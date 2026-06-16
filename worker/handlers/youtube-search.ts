import { jsonResponse } from "../cors"
import { searchViaInnertube } from "../lib/youtube-innertube"

const MIN_QUERY_LEN = 2
const MAX_QUERY_LEN = 200
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20

export function normalizeSearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT)
}

export async function handleYouTubeSearch(query: string, limit: number): Promise<Response> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < MIN_QUERY_LEN) {
    return jsonResponse({ error: "Query too short" }, 400)
  }
  if (trimmed.length > MAX_QUERY_LEN) {
    return jsonResponse({ error: "Query too long" }, 400)
  }

  const cappedLimit = normalizeSearchLimit(limit)

  try {
    const results = await searchViaInnertube(trimmed, cappedLimit)
    return jsonResponse({ query: trimmed, results })
  } catch {
    return jsonResponse({ error: "YouTube search unavailable" }, 502)
  }
}
