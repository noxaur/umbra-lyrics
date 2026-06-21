import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const LT_HOST = "https://lyricstranslate.com"
const USER_AGENT = "Mozilla/5.0 (compatible; umbra/1.0.0)"

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

  const plainLyrics = extractLyricsTranslateEnglish(html)

  return { plainLyrics, trackName, artistName, languageHint }
}

const CJK_IN_TEXT_RE = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/

function htmlBlockToText(raw: string): string {
  return decodeHtml(
    raw
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim()
}

/** Pull English stanzas from bilingual LyricsTranslate pages (alternating par blocks). */
export function extractLyricsTranslateEnglish(html: string): string | null {
  if (!/id=["']song-body["']/i.test(html)) {
    const fallbackMatch = /<div[^>]+class="[^"]*par[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)
    return fallbackMatch?.[1] ? htmlBlockToText(fallbackMatch[1]) : null
  }

  const blocks: string[] = []
  const blockRe = /<div[^>]+class="[^"]*par[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  for (const match of html.matchAll(blockRe)) {
    const text = htmlBlockToText(match[1] ?? "")
    if (text) blocks.push(text)
  }

  if (blocks.length === 0) {
    const bodyMatch = /<div[^>]+id="song-body"[^>]*>([\s\S]*)$/i.exec(html)
    const fallback = bodyMatch?.[1] ? htmlBlockToText(bodyMatch[1]) : null
    return fallback || null
  }

  const latinBlocks = blocks.filter((block) => !CJK_IN_TEXT_RE.test(block))
  const cjkBlocks = blocks.filter((block) => CJK_IN_TEXT_RE.test(block))

  if (latinBlocks.length > 0 && cjkBlocks.length > 0) {
    return latinBlocks.join("\n")
  }

  if (latinBlocks.length > 0) return latinBlocks.join("\n")

  return blocks.join("\n")
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
