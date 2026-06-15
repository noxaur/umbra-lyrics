import { fetchHtml } from "../fetch"
import { decodeHtml, extractAll } from "../html"
import { scoreHit } from "../rank"
import type { ScraperExtractor, ScraperHit, ScraperSearchParams } from "../types"

const SNIPPET_RE = new RegExp(
  '<a[^>]+href="([^"]+/lyrics/[^"]+)"[^>]*>[\\s\\S]*?<span[^>]*class="[^"]*mxm-lyrics__content[^"]*"[^>]*>([\\s\\S]*?)</span>',
  "gi",
)
const TITLE_RE = /<h1[^>]*class="[^"]*mxm-track-title[^"]*"[^>]*>([^<]+)<\/h1>/i
const ARTIST_RE = /<h2[^>]*class="[^"]*mxm-track-artist[^"]*"[^>]*>([^<]+)<\/h2>/i

export function parseMusixmatchSnippets(html: string): Array<{ url: string; snippet: string }> {
  const hits: Array<{ url: string; snippet: string }> = []
  for (const match of html.matchAll(SNIPPET_RE)) {
    const url = match[1].startsWith("http") ? match[1] : `https://www.musixmatch.com${match[1]}`
    hits.push({ url, snippet: decodeHtml(match[2]) })
  }
  return hits
}

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
    const query = params.q?.trim() || [params.artist, params.track].filter(Boolean).join(" ")
    if (!query.trim()) return []

    const searchUrl = `https://www.musixmatch.com/search/${encodeURIComponent(query)}`
    const result = await fetchHtml(searchUrl)
    if (!result.ok) return []

    const snippets = parseMusixmatchSnippets(result.html)
    const results: ScraperHit[] = []

    for (const hit of snippets.slice(0, 3)) {
      const plainLyrics = hit.snippet.trim()
      if (!plainLyrics) continue

      const candidate: ScraperHit = {
        source: "musixmatch",
        sourceId: hit.url,
        url: hit.url,
        trackName: params.track || query,
        artistName: params.artist,
        plainLyrics,
        syncedLyrics: null,
        confidence: 0,
      }
      candidate.confidence = scoreHit(candidate, params, musixmatchExtractor.priority) + 30
      results.push(candidate)
    }

    if (results.length > 0) return results

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
