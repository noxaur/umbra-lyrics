import { jsonResponse } from "../cors"
import { decodeHtml, lrcToPlain } from "../lib/normalize"

const PETIT_HOST = "https://petitlyrics.com"
const USER_AGENT = "Mozilla/5.0 (compatible; song-kara/1.0.0)"

export type PetitLyricsHit = {
  id: string
  trackName: string
  artistName: string
  syncedLyrics: string
  plainLyrics: string | null
}

const SEARCH_ROW_RE =
  /<tr[^>]*>[\s\S]*?<a[^>]+href="(\/lyrics\/\d+)"[^>]*>([^<]+)<\/a>[\s\S]*?<\/tr>/gi

export function parsePetitLyricsSearch(html: string): Array<{ path: string; title: string }> {
  const rows: Array<{ path: string; title: string }> = []
  for (const match of html.matchAll(SEARCH_ROW_RE)) {
    rows.push({ path: match[1], title: decodeHtml(match[2]) })
  }
  return rows
}

export function parsePetitLyricsLrc(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/\[\d{2}:\d{2}/.test(trimmed)) return trimmed
  return null
}

export function parsePetitLyricsPage(html: string): {
  syncedLyrics: string | null
  trackName: string
  artistName: string
} {
  const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)
  const title = titleMatch?.[1]?.trim() ?? ""

  let trackName = title
  let artistName = ""
  const parts = title.split(/\s[-–—\/]\s/)
  if (parts.length >= 2) {
    artistName = parts[0].trim()
    trackName = parts.slice(1).join(" - ").trim()
  }

  const lrcMatch =
    /<textarea[^>]+id="[^"]*lrc[^"]*"[^>]*>([\s\S]*?)<\/textarea>/i.exec(html) ??
    /<pre[^>]+class="[^"]*lrc[^"]*"[^>]*>([\s\S]*?)<\/pre>/i.exec(html) ??
    /\[(\d{2}:\d{2}(?:\.\d{2})?)\][^\n]+/i.exec(html)

  let syncedLyrics: string | null = null
  if (lrcMatch) {
    if (lrcMatch[0].startsWith("[")) {
      syncedLyrics = html.match(/(\[\d{2}:\d{2}(?:\.\d{2})?\][^\n]+\n?)+/g)?.join("\n") ?? null
    } else {
      syncedLyrics = parsePetitLyricsLrc(decodeHtml(lrcMatch[1]))
    }
  }

  return { syncedLyrics, trackName, artistName }
}

async function fetchPage(path: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : `${PETIT_HOST}${path}`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  return res.text()
}

export async function handlePetitLyricsSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const query = [artist, track].filter(Boolean).join(" ")
  const searchUrl = `${PETIT_HOST}/search?keyword=${encodeURIComponent(query)}`

  try {
    const searchHtml = await fetchPage(searchUrl)
    if (!searchHtml) return jsonResponse({ results: [] })

    const rows = parsePetitLyricsSearch(searchHtml).slice(0, 3)
    const results: PetitLyricsHit[] = []

    for (const row of rows) {
      const pageHtml = await fetchPage(row.path)
      if (!pageHtml) continue
      const parsed = parsePetitLyricsPage(pageHtml)
      if (!parsed.syncedLyrics?.trim()) continue
      results.push({
        id: row.path,
        trackName: parsed.trackName || row.title || track,
        artistName: parsed.artistName || artist,
        syncedLyrics: parsed.syncedLyrics,
        plainLyrics: lrcToPlain(parsed.syncedLyrics) || null,
      })
    }

    return jsonResponse({ results })
  } catch {
    return jsonResponse({ results: [] })
  }
}
