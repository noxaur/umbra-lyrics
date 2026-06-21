import { jsonResponse } from "../cors"
import { handleMegalobizSearch } from "./megalobiz"
import { fetchSyncedLrcWithMegalobiz } from "../scraper/lrc-sources"

export async function handleLyricsLrc(artist: string, track: string): Promise<Response> {
  if (!track.trim()) {
    return jsonResponse({ error: "Missing track" }, 400)
  }

  try {
    const result = await fetchSyncedLrcWithMegalobiz(
      { artist: artist.trim(), track: track.trim() },
      handleMegalobizSearch,
    )

    if (!result) {
      return jsonResponse({ error: "No synced lyrics found" }, 404)
    }

    return jsonResponse({ result })
  } catch {
    return jsonResponse({ error: "LRC fetch failed" }, 502)
  }
}
