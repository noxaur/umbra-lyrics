import { fetchHtml } from "../fetch"
import { decodeHtml, extractFirst, slugifyAz } from "../html"
import { scoreHit } from "../rank"
import type { ScraperExtractor, ScraperHit, ScraperSearchParams } from "../types"

const AZ_LYRICS_DIV_RE = /<div[^>]*class="[^"]*lyricsh[^"]*"[^>]*>([\s\S]*?)<\/div>/i
const AZ_RINGTONE_RE = /<!-- Usage of azlyrics\.com content[\s\S]*$/i

export function parseAzLyricsHtml(html: string): string | null {
  const block = extractFirst(html, AZ_LYRICS_DIV_RE)
  if (!block) return null
  const withoutRingtone = block.replace(AZ_RINGTONE_RE, "")
  const text = decodeHtml(withoutRingtone)
  return text || null
}

export function buildAzLyricsUrl(artist: string, track: string): string {
  const a = slugifyAz(artist)
  const t = slugifyAz(track)
  return `https://www.azlyrics.com/lyrics/${a}/${t}.html`
}

export const azlyricsExtractor: ScraperExtractor = {
  id: "azlyrics",
  label: "AZLyrics",
  priority: 3,
  async search(params: ScraperSearchParams): Promise<ScraperHit[]> {
    if (!params.artist.trim() || !params.track.trim()) return []

    const url = buildAzLyricsUrl(params.artist, params.track)
    const result = await fetchHtml(url)
    if (!result.ok) return []

    const plainLyrics = parseAzLyricsHtml(result.html)
    if (!plainLyrics) return []

    const candidate: ScraperHit = {
      source: "azlyrics",
      sourceId: url,
      url,
      trackName: params.track,
      artistName: params.artist,
      plainLyrics,
      syncedLyrics: null,
      confidence: 0,
    }
    candidate.confidence = scoreHit(candidate, params, azlyricsExtractor.priority)
    return [candidate]
  },
}
