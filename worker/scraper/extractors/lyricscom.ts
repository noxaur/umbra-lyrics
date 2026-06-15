import { fetchHtml } from "../fetch"
import { decodeHtml, extractAll, extractFirst, slugifyForUrl } from "../html"
import { scoreHit } from "../rank"
import type { ScraperExtractor, ScraperHit, ScraperSearchParams } from "../types"

const LYRICS_BODY_RE = /<p[^>]+id="lyric-body-text"[^>]*>([\s\S]*?)<\/p>/i
const SEARCH_HIT_RE =
  /<a[^>]+href="(\/lyrics\/[^"]+)"[^>]*class="[^"]*song-result-card[^"]*"[^>]*>[\s\S]*?<p[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/p>[\s\S]*?<p[^>]*class="[^"]*artist[^"]*"[^>]*>([^<]+)<\/p>/gi

export function parseLyricsComLyricsHtml(html: string): string | null {
  const block = extractFirst(html, LYRICS_BODY_RE)
  if (!block) return null
  return decodeHtml(block) || null
}

export function parseLyricsComSearchHtml(html: string): Array<{ path: string; title: string; artist: string }> {
  const hits: Array<{ path: string; title: string; artist: string }> = []
  for (const match of html.matchAll(SEARCH_HIT_RE)) {
    hits.push({ path: match[1], title: match[2].trim(), artist: match[3].trim() })
  }
  return hits
}

export function buildLyricsComUrl(artist: string, track: string): string {
  const a = slugifyForUrl(artist)
  const t = slugifyForUrl(track)
  return `https://www.lyrics.com/lyric/${t}/${a}`
}

export const lyricscomExtractor: ScraperExtractor = {
  id: "lyricscom",
  label: "Lyrics.com",
  priority: 4,
  async search(params: ScraperSearchParams): Promise<ScraperHit[]> {
    const query = params.q?.trim() || [params.artist, params.track].filter(Boolean).join(" ")
    if (!query.trim()) return []

    const searchUrl = `https://www.lyrics.com/lyrics/${encodeURIComponent(query)}`
    let result = await fetchHtml(searchUrl)

    if (result.ok) {
      const direct = parseLyricsComLyricsHtml(result.html)
      if (direct) {
        const candidate: ScraperHit = {
          source: "lyricscom",
          sourceId: searchUrl,
          url: searchUrl,
          trackName: params.track || query,
          artistName: params.artist,
          plainLyrics: direct,
          syncedLyrics: null,
          confidence: 0,
        }
        candidate.confidence = scoreHit(candidate, params, lyricscomExtractor.priority)
        return [candidate]
      }
    }

    const altUrl = params.artist && params.track ? buildLyricsComUrl(params.artist, params.track) : null
    if (altUrl) {
      result = await fetchHtml(altUrl)
      if (result.ok) {
        const plainLyrics = parseLyricsComLyricsHtml(result.html)
        if (plainLyrics) {
          const candidate: ScraperHit = {
            source: "lyricscom",
            sourceId: altUrl,
            url: altUrl,
            trackName: params.track,
            artistName: params.artist,
            plainLyrics,
            syncedLyrics: null,
            confidence: 0,
          }
          candidate.confidence = scoreHit(candidate, params, lyricscomExtractor.priority)
          return [candidate]
        }
      }
    }

    const searchPageUrl = `https://www.lyrics.com/serp.php?st=${encodeURIComponent(query)}`
    const searchResult = await fetchHtml(searchPageUrl)
    if (!searchResult.ok) return []

    const hits = parseLyricsComSearchHtml(searchResult.html)
    const results: ScraperHit[] = []

    for (const hit of hits.slice(0, 3)) {
      const pageUrl = `https://www.lyrics.com${hit.path}`
      const page = await fetchHtml(pageUrl)
      if (!page.ok) continue
      const plainLyrics = parseLyricsComLyricsHtml(page.html)
      if (!plainLyrics) continue

      const candidate: ScraperHit = {
        source: "lyricscom",
        sourceId: pageUrl,
        url: pageUrl,
        trackName: hit.title,
        artistName: hit.artist,
        plainLyrics,
        syncedLyrics: null,
        confidence: 0,
      }
      candidate.confidence = scoreHit(candidate, params, lyricscomExtractor.priority)
      results.push(candidate)
    }

    return results
  },
}

/** Test helper: parse search result titles from simplified HTML. */
export function parseLyricsComSearchTitles(html: string): string[] {
  return extractAll(html, /<p[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/p>/gi)
}
