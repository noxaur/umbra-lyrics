import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const GENIUS_HOST = "https://genius.com"
const USER_AGENT = "Mozilla/5.0 (compatible; song-kara/1.0.0)"

export type GeniusHit = {
  id: number
  url: string
  trackName: string
  artistName: string
  plainLyrics: string
}

type GeniusSearchResponse = {
  response?: {
    sections?: Array<{
      type?: string
      hits?: Array<{
        result?: {
          id?: number
          url?: string
          full_title?: string
          title?: string
          primary_artist?: { name?: string }
        }
      }>
    }>
  }
}

export function parseGeniusSearch(data: GeniusSearchResponse): Array<{
  id: number
  url: string
  trackName: string
  artistName: string
}> {
  const hits: Array<{ id: number; url: string; trackName: string; artistName: string }> = []
  for (const section of data.response?.sections ?? []) {
    if (section.type !== "song") continue
    for (const hit of section.hits ?? []) {
      const result = hit.result
      if (!result?.id || !result.url) continue
      hits.push({
        id: result.id,
        url: result.url,
        trackName: result.title?.trim() ?? result.full_title?.trim() ?? "",
        artistName: result.primary_artist?.name?.trim() ?? "",
      })
    }
  }
  return hits
}

export function parseGeniusLyricsHtml(html: string): string | null {
  const containerMatch =
    /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/i.exec(html) ??
    /class="[^"]*Lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)

  if (containerMatch?.[1]) {
    const text = decodeHtml(containerMatch[1])
    if (text.trim()) return text
  }

  const preloaded = /window\.__PRELOADED_STATE__\s*=\s*JSON\.parse\('(.+?)'\)/s.exec(html)
  if (preloaded?.[1]) {
    try {
      const unescaped = preloaded[1].replace(/\\'/g, "'").replace(/\\n/g, "\n")
      const state = JSON.parse(unescaped) as {
        songPage?: { lyrics?: { body?: { html?: string } } }
      }
      const bodyHtml = state.songPage?.lyrics?.body?.html
      if (bodyHtml) {
        const text = decodeHtml(bodyHtml)
        if (text.trim()) return text
      }
    } catch {
      // fall through
    }
  }

  return null
}

async function fetchGeniusLyrics(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  return parseGeniusLyricsHtml(await res.text())
}

export async function handleGeniusSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const query = [artist, track].filter(Boolean).join(" ")
  const searchUrl = `${GENIUS_HOST}/api/search/multi?q=${encodeURIComponent(query)}`

  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return jsonResponse({ results: [] })

    const data = (await res.json()) as GeniusSearchResponse
    const matches = parseGeniusSearch(data).slice(0, 3)
    const results: GeniusHit[] = []

    for (const match of matches) {
      const plainLyrics = await fetchGeniusLyrics(match.url)
      if (!plainLyrics) continue
      results.push({
        id: match.id,
        url: match.url,
        trackName: match.trackName,
        artistName: match.artistName,
        plainLyrics,
      })
    }

    return jsonResponse({ results })
  } catch {
    return jsonResponse({ results: [] })
  }
}
