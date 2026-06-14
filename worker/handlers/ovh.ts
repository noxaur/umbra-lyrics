import { jsonResponse } from "../cors"

const OVH_BASE = "https://api.lyrics.ovh/v1"
const USER_AGENT = "song-kara/1.0.0 (https://github.com/song-kara)"

export async function handleOvhLyrics(artist: string, title: string): Promise<Response> {
  const url = `${OVH_BASE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    })

    if (!res.ok) {
      return jsonResponse({ error: "Not found" }, res.status === 404 ? 404 : 502)
    }

    const data = (await res.json()) as { lyrics?: string }
    if (!data.lyrics?.trim()) {
      return jsonResponse({ error: "Empty lyrics" }, 404)
    }

    return jsonResponse({ lyrics: data.lyrics })
  } catch {
    return jsonResponse({ error: "Lyrics service unavailable" }, 502)
  }
}
