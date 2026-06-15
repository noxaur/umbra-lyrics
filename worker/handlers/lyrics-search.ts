import { jsonResponse } from "../cors"
import { searchAllScrapers } from "../scraper/registry"
import type { ScraperSearchParams } from "../scraper/types"

export async function handleLyricsSearch(
  q: string,
  artist: string,
  track: string,
): Promise<Response> {
  const resolvedTrack = track.trim() || q.trim()
  if (!resolvedTrack) {
    return jsonResponse({ error: "Missing track or q" }, 400)
  }

  const params: ScraperSearchParams = {
    q: q.trim() || undefined,
    artist: artist.trim(),
    track: resolvedTrack,
  }

  try {
    const candidates = await searchAllScrapers(params)
    return jsonResponse({
      query: { q: q.trim(), artist: artist.trim(), track: resolvedTrack },
      candidates,
    })
  } catch {
    return jsonResponse({ query: params, candidates: [] })
  }
}
