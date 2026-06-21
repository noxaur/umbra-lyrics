import { fetchHtml } from "../fetch"
import { decodeHtml, extractFirst, slugifyForUrl } from "../html"
import { scoreHit } from "../rank"
import type { ScraperExtractor, ScraperHit, ScraperSearchParams } from "../types"

const ANIME_LYRICS_TD_RE = /<td[^>]*class="[^"]*padding2[^"]*"[^>]*>([\s\S]*?)<\/td>/gi
const ANIME_SEARCH_LINK_RE =
  /<a[^>]+href="([^"]+\.php\?[^"]*song[^"]*)"[^>]*>([^<]+)<\/a>/gi
const LNS_LYRICS_RE = /<div[^>]+class="[^"]*lyric-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i
const LNS_SEARCH_RE =
  /<a[^>]+href="(\/lyrics\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/gi

export function parseAnimelyricsHtml(html: string): string | null {
  const cells: string[] = []
  for (const match of html.matchAll(ANIME_LYRICS_TD_RE)) {
    const text = decodeHtml(match[1])
    if (text && !text.toLowerCase().includes("animelyrics.com")) cells.push(text)
  }
  const joined = cells.join("\n").trim()
  return joined || null
}

export function parseLyricalNonsenseHtml(html: string): string | null {
  const block = extractFirst(html, LNS_LYRICS_RE)
  if (!block) return null
  return decodeHtml(block) || null
}

export function parseAnimelyricsSearchHtml(html: string): Array<{ url: string; title: string }> {
  const hits: Array<{ url: string; title: string }> = []
  for (const match of html.matchAll(ANIME_SEARCH_LINK_RE)) {
    const path = match[1]
    const url = path.startsWith("http") ? path : `https://www.animelyrics.com${path.replace(/^\./, "")}`
    hits.push({ url, title: decodeHtml(match[2]) })
  }
  return hits
}

export function parseLyricalNonsenseSearchHtml(html: string): Array<{ path: string; title: string }> {
  const hits: Array<{ path: string; title: string }> = []
  for (const match of html.matchAll(LNS_SEARCH_RE)) {
    hits.push({ path: match[1], title: match[2].trim() })
  }
  return hits
}

const animelyricsExtractor: ScraperExtractor = {
  id: "animelyrics",
  label: "AnimeLyrics",
  priority: 6,
  async search(params: ScraperSearchParams): Promise<ScraperHit[]> {
    const query = params.q?.trim() || [params.artist, params.track].filter(Boolean).join(" ")
    if (!query.trim()) return []

    const searchUrl = `https://www.animelyrics.com/search.php?q=${encodeURIComponent(query)}`
    const search = await fetchHtml(searchUrl)
    if (!search.ok) return []

    const links = parseAnimelyricsSearchHtml(search.html)
    const results: ScraperHit[] = []

    for (const link of links.slice(0, 3)) {
      const page = await fetchHtml(link.url)
      if (!page.ok) continue
      const plainLyrics = parseAnimelyricsHtml(page.html)
      if (!plainLyrics) continue

      const candidate: ScraperHit = {
        source: "animelyrics",
        sourceId: link.url,
        url: link.url,
        trackName: link.title || params.track,
        artistName: params.artist,
        plainLyrics,
        syncedLyrics: null,
        confidence: 0,
      }
      candidate.confidence = scoreHit(candidate, params, animelyricsExtractor.priority)
      results.push(candidate)
    }

    if (results.length > 0) return results

    const slug = slugifyForUrl(params.track)
    if (!slug) return []
    const directUrl = `https://www.animelyrics.com/anime/${slug}/${slug}.php`
    const direct = await fetchHtml(directUrl)
    if (!direct.ok) return []

    const plainLyrics = parseAnimelyricsHtml(direct.html)
    if (!plainLyrics) return []

    const candidate: ScraperHit = {
      source: "animelyrics",
      sourceId: directUrl,
      url: directUrl,
      trackName: params.track,
      artistName: params.artist,
      plainLyrics,
      syncedLyrics: null,
      confidence: 0,
    }
    candidate.confidence = scoreHit(candidate, params, animelyricsExtractor.priority)
    return [candidate]
  },
}

const lyricalNonsenseExtractor: ScraperExtractor = {
  id: "lyrical-nonsense",
  label: "Lyrical Nonsense",
  priority: 6,
  async search(params: ScraperSearchParams): Promise<ScraperHit[]> {
    const query = params.q?.trim() || [params.artist, params.track].filter(Boolean).join(" ")
    if (!query.trim()) return []

    const searchUrl = `https://www.lyrical-nonsense.com/global/search/?q=${encodeURIComponent(query)}`
    const search = await fetchHtml(searchUrl)
    if (!search.ok) return []

    const links = parseLyricalNonsenseSearchHtml(search.html)
    const results: ScraperHit[] = []

    for (const link of links.slice(0, 3)) {
      const pageUrl = `https://www.lyrical-nonsense.com${link.path}`
      const page = await fetchHtml(pageUrl)
      if (!page.ok) continue
      const plainLyrics = parseLyricalNonsenseHtml(page.html)
      if (!plainLyrics) continue

      const candidate: ScraperHit = {
        source: "lyrical-nonsense",
        sourceId: pageUrl,
        url: pageUrl,
        trackName: link.title || params.track,
        artistName: params.artist,
        plainLyrics,
        syncedLyrics: null,
        confidence: 0,
      }
      candidate.confidence = scoreHit(candidate, params, lyricalNonsenseExtractor.priority)
      results.push(candidate)
    }

    return results
  },
}

export const animeExtractors: ScraperExtractor[] = [animelyricsExtractor, lyricalNonsenseExtractor]

/** Combined anime-site search (animelyrics + lyrical-nonsense). */
export const animeLyricsExtractor: ScraperExtractor = {
  id: "animelyrics",
  label: "Anime lyrics",
  priority: 6,
  async search(params: ScraperSearchParams): Promise<ScraperHit[]> {
    const batches = await Promise.allSettled(animeExtractors.map((e) => e.search(params)))
    const hits: ScraperHit[] = []
    for (const batch of batches) {
      if (batch.status === "fulfilled") hits.push(...batch.value)
    }
    return hits
  },
}
