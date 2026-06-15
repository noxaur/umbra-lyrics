import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const LT_HOST = "https://lyricstranslate.com"
const USER_AGENT = "Mozilla/5.0 (compatible; song-kara/1.0.0)"

export type LyricsTranslateHit = {
  id: string
  url: string
  trackName: string
  artistName: string
  plainLyrics: string
  languageHint?: string
}

const SEARCH_LINK_RE =
  /<a[^>]+href="(\/[^"]+-lyrics\.html)"[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/gi

export function parseLyricsTranslateSearch(html: string): Array<{
  url: string
  title: string
}> {
  const links: Array<{ url: string; title: string }> = []
  for (const match of html.matchAll(SEARCH_LINK_RE)) {
    links.push({ url: match[1], title: decodeHtml(match[2]) })
  }
  return links
}

export function parseLyricsTranslatePage(html: string): {
  plainLyrics: string | null
  trackName: string
  artistName: string
  languageHint?: string
} {
  const titleMatch = /<h2[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h2>/i.exec(html)
  const title = titleMatch?.[1]?.trim() ?? ""

  let trackName = title
  let artistName = ""
  const bySplit = title.split(/\s[-–—]\s/)
  if (bySplit.length >= 2) {
    trackName = bySplit[0].trim()
    artistName = bySplit.slice(1).join(" - ").trim()
  }

  const langMatch = /lang(?:uage)?[^>]*>([A-Za-z]+)</i.exec(html)
  const languageHint = langMatch?.[1]?.toLowerCase()

  const lyricsMatch =
    /<div[^>]+id="song-body"[^>]*>([\s\S]*?)<\/div>/i.exec(html) ??
    /<div[^>]+class="[^"]*par[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)

  const plainLyrics = lyricsMatch?.[1] ? decodeHtml(lyricsMatch[1]) : null

  return { plainLyrics, trackName, artistName, languageHint }
}

async function fetchPage(path: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : `${LT_HOST}${path}`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  return res.text()
}

export async function handleLyricsTranslateSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const query = [artist, track].filter(Boolean).join(" ")
  const searchUrl = `${LT_HOST}/en/site-search?query=${encodeURIComponent(query)}`

  try {
    const searchHtml = await fetchPage(searchUrl)
    if (!searchHtml) return jsonResponse({ results: [] })

    const links = parseLyricsTranslateSearch(searchHtml).slice(0, 3)
    const results: LyricsTranslateHit[] = []

    for (const link of links) {
      const pageHtml = await fetchPage(link.url)
      if (!pageHtml) continue
      const parsed = parseLyricsTranslatePage(pageHtml)
      if (!parsed.plainLyrics?.trim()) continue
      results.push({
        id: link.url,
        url: `${LT_HOST}${link.url}`,
        trackName: parsed.trackName || track,
        artistName: parsed.artistName || artist,
        plainLyrics: parsed.plainLyrics,
        languageHint: parsed.languageHint,
      })
    }

    return jsonResponse({ results })
  } catch {
    return jsonResponse({ results: [] })
  }
}
