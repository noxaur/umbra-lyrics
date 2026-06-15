import { jsonResponse } from "../cors"
import { decodeHtml, extractXmlTag } from "../lib/normalize"

const CHARTLYRICS_BASE = "http://api.chartlyrics.com/apiv1.asmx"
const USER_AGENT = "song-kara/1.0.0 (https://github.com/song-kara)"

export type ChartLyricsHit = {
  id: string
  trackName: string
  artistName: string
  plainLyrics: string
}

export function parseChartLyricsDirectXml(xml: string): ChartLyricsHit | null {
  const lyrics = extractXmlTag(xml, "Lyric")
  if (!lyrics?.trim()) return null

  const id = extractXmlTag(xml, "LyricId") ?? "0"
  const trackName = extractXmlTag(xml, "LyricSong") ?? ""
  const artistName = extractXmlTag(xml, "LyricArtist") ?? ""

  return {
    id,
    trackName: decodeHtml(trackName),
    artistName: decodeHtml(artistName),
    plainLyrics: decodeHtml(lyrics),
  }
}

export async function handleChartLyricsSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const q = new URLSearchParams({ artist, song: track })
  const url = `${CHARTLYRICS_BASE}/SearchLyricDirect?${q}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return jsonResponse({ results: [] })

    const xml = await res.text()
    const hit = parseChartLyricsDirectXml(xml)
    return jsonResponse({ results: hit ? [hit] : [] })
  } catch {
    return jsonResponse({ results: [] })
  }
}
