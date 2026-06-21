import { fetchHtml } from "../fetch"
import { decodeHtml, extractAll } from "../html"
import { scoreHit } from "../rank"
import type { ScraperExtractor, ScraperHit, ScraperSearchParams } from "../types"

const TITLE_RE = /<h1[^>]*class="[^"]*mxm-track-title[^"]*"[^>]*>([^<]+)<\/h1>/i
const ARTIST_RE = /<h2[^>]*class="[^"]*mxm-track-artist[^"]*"[^>]*>([^<]+)<\/h2>/i

export function parseMusixmatchPageSnippet(html: string): string | null {
  const snippets = extractAll(html, /<span[^>]*class="[^"]*mxm-lyrics__content[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)
  const text = snippets.map((s) => decodeHtml(s)).filter(Boolean).join("\n")
  return text || null
}

export const musixmatchExtractor: ScraperExtractor = {
  id: "musixmatch",
  label: "Musixmatch",
  priority: 5,
  async search(params: ScraperSearchParams): Promise<ScraperHit[]> {
    if (!params.artist.trim() || !params.track.trim()) return []

    const pageUrl = `https://www.musixmatch.com/lyrics/${encodeURIComponent(params.artist)}/${encodeURIComponent(params.track)}`
    const page = await fetchHtml(pageUrl)
    if (!page.ok) return []

    const snippet = parseMusixmatchPageSnippet(page.html)
    if (!snippet) return []

    const title = page.html.match(TITLE_RE)?.[1]?.trim() ?? params.track
    const artist = page.html.match(ARTIST_RE)?.[1]?.trim() ?? params.artist

    const candidate: ScraperHit = {
      source: "musixmatch",
      sourceId: pageUrl,
      url: pageUrl,
      trackName: title,
      artistName: artist,
      plainLyrics: snippet,
      syncedLyrics: null,
      confidence: 0,
    }
    candidate.confidence = scoreHit(candidate, params, musixmatchExtractor.priority) + 30
    return [candidate]
  },
}
