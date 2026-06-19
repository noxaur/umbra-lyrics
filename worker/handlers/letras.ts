import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const LETRAS_HOST = "https://www.letras.mus.br"
const USER_AGENT = "Mozilla/5.0 (compatible; umbra/1.0.0)"

export type LetrasHit = {
  id: string
  url: string
  trackName: string
  artistName: string
  plainLyrics: string
  languageHint: string
}

const SEARCH_LINK_RE =
  /<a[^>]+href="(\/[^/]+\/[^/]+\/)"[^>]*>([^<]+)<\/a>/gi

export function parseLetrasSearch(html: string): Array<{ url: string; title: string }> {
  const links: Array<{ url: string; title: string }> = []
  for (const match of html.matchAll(SEARCH_LINK_RE)) {
    const href = match[1]
    if (!href.match(/^\/[^/]+\/[^/]+\/$/)) continue
    links.push({ url: href, title: decodeHtml(match[2]) })
  }
  return links
}

export function parseLetrasPage(html: string): {
  plainLyrics: string | null
  trackName: string
  artistName: string
} {
  const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)
  const title = titleMatch?.[1]?.trim() ?? ""

  const artistMatch = /<h2[^>]*>([^<]+)<\/h2>/i.exec(html)
  const artistName = artistMatch?.[1]?.trim() ?? ""

  const lyricsMatch =
    /<div[^>]+class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html) ??
    /<div[^>]+class="[^"]*cnt-letra[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)

  const plainLyrics = lyricsMatch?.[1] ? decodeHtml(lyricsMatch[1]) : null
  return { plainLyrics, trackName: title, artistName }
}

async function fetchPage(path: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : `${LETRAS_HOST}${path}`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  return res.text()
}

export async function handleLetrasSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const query = [artist, track].filter(Boolean).join(" ")
  const searchUrl = `${LETRAS_HOST}/buscar/?q=${encodeURIComponent(query)}`

  try {
    const searchHtml = await fetchPage(searchUrl)
    if (!searchHtml) return jsonResponse({ results: [] })

    const links = parseLetrasSearch(searchHtml).slice(0, 3)
    const results: LetrasHit[] = []

    for (const link of links) {
      const pageHtml = await fetchPage(link.url)
      if (!pageHtml) continue
      const parsed = parseLetrasPage(pageHtml)
      if (!parsed.plainLyrics?.trim()) continue
      results.push({
        id: link.url,
        url: `${LETRAS_HOST}${link.url}`,
        trackName: parsed.trackName || track,
        artistName: parsed.artistName || artist,
        plainLyrics: parsed.plainLyrics,
        languageHint: "es",
      })
    }

    return jsonResponse({ results })
  } catch {
    return jsonResponse({ results: [] })
  }
}
