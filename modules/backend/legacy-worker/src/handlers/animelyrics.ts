import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const ANIME_HOST = "https://www.animelyrics.com"
const USER_AGENT = "Mozilla/5.0 (compatible; umbra/1.0.0)"

export type AnimeLyricsHit = {
  id: string
  url: string
  trackName: string
  artistName: string
  plainLyrics: string
  languageHint: string
}

const SEARCH_RESULT_RE =
  /<a[^>]+href="([^"]+\.htm[l]?)"[^>]*>([^<]+)<\/a>/gi

export function parseAnimeLyricsSearch(html: string): Array<{ url: string; title: string }> {
  const links: Array<{ url: string; title: string }> = []
  for (const match of html.matchAll(SEARCH_RESULT_RE)) {
    const href = match[1]
    if (!href.includes("/anime/") && !href.includes("/game/")) continue
    links.push({ url: href, title: decodeHtml(match[2]) })
  }
  return links
}

export function parseAnimeLyricsPage(html: string): {
  plainLyrics: string | null
  trackName: string
  artistName: string
  languageHint: string
} {
  const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)
  const title = titleMatch?.[1]?.trim() ?? ""

  const isJapanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(html)
  const languageHint = isJapanese ? "ja" : "en"

  const lyricsBlocks: string[] = []
  for (const match of html.matchAll(
    /<div[^>]+class="[^"]*padding[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  )) {
    const text = decodeHtml(match[1])
    if (text.length > 4) lyricsBlocks.push(text)
  }

  const fallbackMatch = /<td[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/td>/gi
  for (const match of html.matchAll(fallbackMatch)) {
    const text = decodeHtml(match[1])
    if (text.length > 4) lyricsBlocks.push(text)
  }

  const plainLyrics = lyricsBlocks.sort((a, b) => b.length - a.length)[0] ?? null

  return {
    plainLyrics,
    trackName: title,
    artistName: "",
    languageHint,
  }
}

async function fetchPage(path: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : `${ANIME_HOST}${path}`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  return res.text()
}

export async function handleAnimeLyricsSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const query = [artist, track].filter(Boolean).join(" ")
  const searchUrl = `${ANIME_HOST}/search.php?q=${encodeURIComponent(query)}`

  try {
    const searchHtml = await fetchPage(searchUrl)
    if (!searchHtml) return jsonResponse({ results: [] })

    const links = parseAnimeLyricsSearch(searchHtml).slice(0, 3)
    const results: AnimeLyricsHit[] = []

    for (const link of links) {
      const pageHtml = await fetchPage(link.url)
      if (!pageHtml) continue
      const parsed = parseAnimeLyricsPage(pageHtml)
      if (!parsed.plainLyrics?.trim()) continue
      results.push({
        id: link.url,
        url: link.url.startsWith("http") ? link.url : `${ANIME_HOST}${link.url}`,
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
