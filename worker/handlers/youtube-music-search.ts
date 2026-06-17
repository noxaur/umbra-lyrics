import { jsonResponse } from "../cors"
import { searchYouTubeMusicViaInnertube } from "../lib/youtube-innertube"

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 20

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT)
}

export async function handleYouTubeMusicSearch(
  artist: string,
  track: string,
  limit: number,
  durationSec?: number,
): Promise<Response> {
  const cleanTrack = track.trim()
  if (!cleanTrack) return jsonResponse({ error: "Missing track" }, 400)

  try {
    const results = await searchYouTubeMusicViaInnertube(
      artist.trim(),
      cleanTrack,
      normalizeLimit(limit),
      durationSec,
    )
    return jsonResponse({ artist: artist.trim(), track: cleanTrack, results })
  } catch {
    return jsonResponse({ error: "YouTube Music search unavailable", results: [] }, 502)
  }
}
