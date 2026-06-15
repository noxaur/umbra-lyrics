import { fetchJson, fetchHtml } from "../fetch"
import { decodeHtml, extractFirst } from "../html"
import { scoreHit } from "../rank"
import type { ScraperExtractor, ScraperHit, ScraperSearchParams } from "../types"

type GeniusSearchResponse = {
  response?: {
    sections?: Array<{
      type: string
      hits?: Array<{
        result?: {
          id: number
          url: string
          title: string
          primary_artist?: { name: string }
        }
      }>
    }>
  }
}

const LYRICS_CONTAINER_RE = /<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi

export function parseGeniusLyricsHtml(html: string): string | null {
  const parts: string[] = []
  for (const match of html.matchAll(LYRICS_CONTAINER_RE)) {
    if (match[1]) parts.push(decodeHtml(match[1]))
  }
  const text = parts.join("\n").trim()
  return text || null
}

export function parseGeniusSearchJson(data: GeniusSearchResponse): Array<{
  id: number
  url: string
  title: string
  artist: string
}> {
  const hits: Array<{ id: number; url: string; title: string; artist: string }> = []
  for (const section of data.response?.sections ?? []) {
    if (section.type !== "song") continue
    for (const hit of section.hits ?? []) {
      const result = hit.result
      if (!result?.url || !result.title) continue
      hits.push({
        id: result.id,
        url: result.url,
        title: result.title,
        artist: result.primary_artist?.name ?? "",
      })
    }
  }
  return hits
}

async function fetchGeniusLyrics(songUrl: string): Promise<string | null> {
  const result = await fetchHtml(songUrl)
  if (!result.ok) return null
  return parseGeniusLyricsHtml(result.html)
}

export const geniusExtractor: ScraperExtractor = {
  id: "genius",
  label: "Genius",
  priority: 2,
  async search(params: ScraperSearchParams): Promise<ScraperHit[]> {
    const query = params.q?.trim() || [params.artist, params.track].filter(Boolean).join(" ")
    if (!query.trim()) return []

    const searchUrl = `https://genius.com/api/search/multi?per_page=5&q=${encodeURIComponent(query)}`
    const json = await fetchJson<GeniusSearchResponse>(searchUrl)
    if (!json.ok) return []

    const results: ScraperHit[] = []
    for (const hit of parseGeniusSearchJson(json.data).slice(0, 3)) {
      const plainLyrics = await fetchGeniusLyrics(hit.url)
      if (!plainLyrics) continue

      const candidate: ScraperHit = {
        source: "genius",
        sourceId: String(hit.id),
        url: hit.url,
        trackName: hit.title,
        artistName: hit.artist,
        plainLyrics,
        syncedLyrics: null,
        confidence: 0,
      }
      candidate.confidence = scoreHit(candidate, params, geniusExtractor.priority)
      results.push(candidate)
    }

    return results
  },
}

/** Exported for tests when HTML is injected directly. */
export function parseGeniusLyricsFromPage(html: string): string | null {
  const fallback = extractFirst(html, /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
  return parseGeniusLyricsHtml(html) ?? (fallback ? decodeHtml(fallback) : null)
}
