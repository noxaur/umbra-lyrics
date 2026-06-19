import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const SM_HOST = "https://www.songmeanings.com"
const USER_AGENT = "Mozilla/5.0 (compatible; umbra/1.0.0)"

export type SongMeaningsHit = {
  id: string
  url: string
  trackName: string
  artistName: string
  plainLyrics: string
}

const SEARCH_LINK_RE =
  /<a[^>]+href="(\/songs\/view\/\d+\/)"[^>]*>([^<]+)<\/a>/gi

export function parseSongMeaningsSearch(html: string): Array<{ url: string; title: string }> {
  const links: Array<{ url: string; title: string }> = []
  for (const match of html.matchAll(SEARCH_LINK_RE)) {
    links.push({ url: match[1], title: decodeHtml(match[2]) })
  }
  return links
}

export function parseSongMeaningsPage(html: string): {
  plainLyrics: string | null
  trackName: string
  artistName: string
} {
  const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)
  const title = titleMatch?.[1]?.trim() ?? ""

  let trackName = title
  let artistName = ""
  const bySplit = title.split(/\sby\s/i)
  if (bySplit.length === 2) {
    trackName = bySplit[0].trim()
    artistName = bySplit[1].trim()
  }

  const lyricsMatch =
    /<div[^>]+class="[^"]*song-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html) ??
    /<p[^>]+class="[^"]*songLyricsV14[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html)

  const plainLyrics = lyricsMatch?.[1] ? decodeHtml(lyricsMatch[1]) : null
  return { plainLyrics, trackName, artistName }
}

async function fetchPage(path: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : `${SM_HOST}${path}`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  return res.text()
}

export async function handleSongMeaningsSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const query = [artist, track].filter(Boolean).join(" ")
  const searchUrl = `${SM_HOST}/query/?query=${encodeURIComponent(query)}&type=all`

  try {
    const searchHtml = await fetchPage(searchUrl)
    if (!searchHtml) return jsonResponse({ results: [] })

    const links = parseSongMeaningsSearch(searchHtml).slice(0, 3)
    const results: SongMeaningsHit[] = []

    for (const link of links) {
      const pageHtml = await fetchPage(link.url)
      if (!pageHtml) continue
      const parsed = parseSongMeaningsPage(pageHtml)
      if (!parsed.plainLyrics?.trim()) continue
      results.push({
        id: link.url,
        url: `${SM_HOST}${link.url}`,
        trackName: parsed.trackName || track,
        artistName: parsed.artistName || artist,
        plainLyrics: parsed.plainLyrics,
      })
    }

    return jsonResponse({ results })
  } catch {
    return jsonResponse({ results: [] })
  }
}
