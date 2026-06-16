import { jsonResponse } from "../cors"
import { fetchPlaylistViaInnertube } from "../lib/youtube-innertube"

const MIN_PLAYLIST_ID_LEN = 2
const MAX_PLAYLIST_ID_LEN = 80
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 100

export function normalizePlaylistLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT)
}

export async function handleYouTubePlaylist(
  playlistId: string,
  limit: number,
  sourceUrl?: string,
): Promise<Response> {
  const trimmed = playlistId.trim()
  if (!trimmed) {
    return jsonResponse({ error: "Missing playlist id" }, 400)
  }
  if (trimmed.length < MIN_PLAYLIST_ID_LEN) {
    return jsonResponse({ error: "Playlist id too short" }, 400)
  }
  if (trimmed.length > MAX_PLAYLIST_ID_LEN) {
    return jsonResponse({ error: "Playlist id too long" }, 400)
  }

  const cappedLimit = normalizePlaylistLimit(limit)

  try {
    const result = await fetchPlaylistViaInnertube(trimmed, cappedLimit, {
      sourceUrl: sourceUrl?.trim() || undefined,
    })
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playlist unavailable"
    if (/not found|private|unavailable|empty|cannot be imported|unviewable/i.test(message)) {
      return jsonResponse({ error: message }, 404)
    }
    return jsonResponse({ error: "YouTube playlist unavailable" }, 502)
  }
}
