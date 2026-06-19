import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const WIKI_API = "https://lyrics.fandom.com/api.php"
const USER_AGENT = "umbra/1.0.0"

export type LyricsWikiHit = {
  id: string
  title: string
  trackName: string
  artistName: string
  plainLyrics: string
}

type WikiSearchResponse = {
  query?: {
    search?: Array<{ pageid?: number; title?: string; snippet?: string }>
  }
}

type WikiParseResponse = {
  parse?: {
    title?: string
    text?: { "*": string }
  }
}

export function parseWikiSearch(data: WikiSearchResponse): Array<{ pageId: number; title: string }> {
  return (data.query?.search ?? [])
    .filter((s) => s.pageid != null && s.title?.trim())
    .map((s) => ({ pageId: s.pageid!, title: s.title!.trim() }))
}

export function parseWikiLyricsWikitext(html: string): string | null {
  const preMatch = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html)
  if (preMatch?.[1]) {
    const text = decodeHtml(preMatch[1])
    if (text.trim().length > 4) return text
  }

  const lyricsDiv = /<div[^>]+class="[^"]*lyricbox[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)
  if (lyricsDiv?.[1]) {
    const text = decodeHtml(lyricsDiv[1])
    if (text.trim().length > 4) return text
  }

  const plain = decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, ""))
  const lines = plain
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("Category:"))
  if (lines.length >= 4) return lines.join("\n")

  return null
}

export function splitWikiTitle(title: string): { trackName: string; artistName: string } {
  const colon = title.split(":")
  if (colon.length >= 2) {
    return { artistName: colon[0].trim(), trackName: colon.slice(1).join(":").trim() }
  }
  const dash = title.split(/\s[-–—]\s/)
  if (dash.length >= 2) {
    return { trackName: dash[0].trim(), artistName: dash.slice(1).join(" - ").trim() }
  }
  return { trackName: title.trim(), artistName: "" }
}

export async function handleLyricsWikiSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const query = [artist, track].filter(Boolean).join(" ")
  const searchParams = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    format: "json",
    origin: "*",
  })

  try {
    const searchRes = await fetch(`${WIKI_API}?${searchParams}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    })
    if (!searchRes.ok) return jsonResponse({ results: [] })

    const searchData = (await searchRes.json()) as WikiSearchResponse
    const pages = parseWikiSearch(searchData).slice(0, 3)
    const results: LyricsWikiHit[] = []

    for (const page of pages) {
      const parseParams = new URLSearchParams({
        action: "parse",
        pageid: String(page.pageId),
        prop: "text",
        format: "json",
        origin: "*",
      })
      const parseRes = await fetch(`${WIKI_API}?${parseParams}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(12_000),
      })
      if (!parseRes.ok) continue

      const parseData = (await parseRes.json()) as WikiParseResponse
      const html = parseData.parse?.text?.["*"] ?? ""
      const plainLyrics = parseWikiLyricsWikitext(html)
      if (!plainLyrics?.trim()) continue

      const title = parseData.parse?.title ?? page.title
      const { trackName, artistName } = splitWikiTitle(title)
      results.push({
        id: String(page.pageId),
        title,
        trackName,
        artistName,
        plainLyrics,
      })
    }

    return jsonResponse({ results })
  } catch {
    return jsonResponse({ results: [] })
  }
}
