import { CORS_HEADERS } from "../cors"
import { fetchHtml } from "../scraper/fetch"
import { extractAll } from "../scraper/html"
import { parseMusixmatchPageSnippet } from "../scraper/extractors/musixmatch"

const MXM_API = "https://api.musixmatch.com/ws/1.1"

type MusixmatchEnv = {
  MUSIXMATCH_API_KEY?: string
}

type ApiTrack = {
  track_id?: number
  track_name?: string
  artist_name?: string
  track_length?: number
  has_lyrics?: number
}

function parseSubtitleToLrc(subtitleBody: string): string | null {
  const lines = subtitleBody
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const lrcLines: string[] = []
  for (const line of lines) {
    const m = line.match(/^(\d{2}):(\d{2})\.(\d{2,3})\s+(.+)$/)
    if (!m) continue
    const ms = m[3].length === 2 ? Number(m[3]) * 10 : Number(m[3])
    const timestamp = `[${m[1]}:${m[2]}.${String(ms).padStart(3, "0").slice(0, 2)}]`
    lrcLines.push(`${timestamp}${m[4]}`)
  }
  return lrcLines.length > 0 ? lrcLines.join("\n") : null
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function textOverlap(a: string, b: string): boolean {
  const x = normalizeText(a)
  const y = normalizeText(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

function scoreApiTrack(
  track: ApiTrack,
  artist: string,
  trackName: string,
  durationSec?: number,
): number {
  let score = 0
  const foundArtist = track.artist_name ?? ""
  const foundTrack = track.track_name ?? ""

  if (!textOverlap(foundArtist, artist)) score += 80
  if (!textOverlap(foundTrack, trackName)) score += 80

  if (durationSec && durationSec > 0 && track.track_length) {
    const delta = Math.abs(track.track_length - durationSec)
    score += delta <= 15 ? delta : delta + 100
  }

  if (track.has_lyrics !== 1) score += 200

  return score
}

function pickBestApiTrack(
  tracks: ApiTrack[],
  artist: string,
  trackName: string,
  durationSec?: number,
): ApiTrack | null {
  if (tracks.length === 0) return null
  return tracks.reduce((best, candidate) =>
    scoreApiTrack(candidate, artist, trackName, durationSec) <
    scoreApiTrack(best, artist, trackName, durationSec)
      ? candidate
      : best,
  )
}

async function apiSearch(
  apiKey: string,
  artist: string,
  track: string,
  durationSec?: number,
): Promise<ApiTrack | null> {
  const url = `${MXM_API}/track.search?q_track=${encodeURIComponent(track)}&q_artist=${encodeURIComponent(artist)}&page_size=3&apikey=${apiKey}&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) return null

  const data = (await res.json()) as {
    message?: { body?: { track_list?: Array<{ track?: ApiTrack }> } }
  }
  const tracks = (data.message?.body?.track_list?.map((t) => t.track).filter(
    (t): t is ApiTrack => Boolean(t),
  ) ?? [])
  return pickBestApiTrack(tracks, artist, track, durationSec)
}

async function apiLyrics(apiKey: string, trackId: number): Promise<string | null> {
  const url = `${MXM_API}/track.lyrics.get?track_id=${trackId}&apikey=${apiKey}&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) return null

  const data = (await res.json()) as {
    message?: { body?: { lyrics?: { lyrics_body?: string } } }
  }
  const body = data.message?.body?.lyrics?.lyrics_body?.trim()
  if (!body || body === "..." || body.includes("*******")) return null
  return body
}

async function apiSubtitle(apiKey: string, trackId: number): Promise<string | null> {
  const url = `${MXM_API}/track.subtitle.get?track_id=${trackId}&apikey=${apiKey}&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) return null

  const data = (await res.json()) as {
    message?: { body?: { subtitle?: { subtitle_body?: string } } }
  }
  const body = data.message?.body?.subtitle?.subtitle_body
  return body ? parseSubtitleToLrc(body) : null
}

async function scraperSearch(artist: string, track: string) {
  const searchUrl = `https://www.musixmatch.com/search/${encodeURIComponent(artist)}/${encodeURIComponent(track)}`
  const searchPage = await fetchHtml(searchUrl)
  if (!searchPage.ok) return null

  const hrefRe = /href="(\/lyrics\/[^"]+)"/gi
  const links = extractAll(searchPage.html, hrefRe)
  const lyricsPath = links.find((l) => l.includes("/lyrics/"))
  if (!lyricsPath) return null

  const pageUrl = `https://www.musixmatch.com${lyricsPath}`
  const page = await fetchHtml(pageUrl)
  if (!page.ok) return null

  const snippet = parseMusixmatchPageSnippet(page.html)
  if (!snippet || snippet.split("\n").filter(Boolean).length < 4) return null

  const titleRe = /<h1[^>]*class="[^"]*mxm-track-title[^"]*"[^>]*>([^<]+)<\/h1>/i
  const artistRe = /<h2[^>]*class="[^"]*mxm-track-artist[^"]*"[^>]*>([^<]+)<\/h2>/i

  return {
    trackName: page.html.match(titleRe)?.[1]?.trim() ?? track,
    artistName: page.html.match(artistRe)?.[1]?.trim() ?? artist,
    plainLyrics: snippet,
    syncedLyrics: null as string | null,
    url: pageUrl,
  }
}

export async function handleMusixmatchSearch(
  artist: string,
  track: string,
  env: MusixmatchEnv,
  durationSec?: number,
): Promise<Response> {
  if (!track.trim()) {
    return new Response(JSON.stringify({ error: "Missing track" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }

  const apiKey = env.MUSIXMATCH_API_KEY?.trim()

  try {
    if (apiKey) {
      const found = await apiSearch(apiKey, artist, track, durationSec)
      if (found?.track_id) {
        const [plain, synced] = await Promise.all([
          apiLyrics(apiKey, found.track_id),
          apiSubtitle(apiKey, found.track_id),
        ])
        if (plain || synced) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  source: "musixmatch",
                  sourceId: String(found.track_id),
                  url: `https://www.musixmatch.com/lyrics/${encodeURIComponent(found.artist_name ?? artist)}/${encodeURIComponent(found.track_name ?? track)}`,
                  trackName: found.track_name ?? track,
                  artistName: found.artist_name ?? artist,
                  plainLyrics: plain,
                  syncedLyrics: synced,
                  confidence: 90,
                },
              ],
            }),
            { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
          )
        }
      }
    }

    const scraped = await scraperSearch(artist, track)
    if (scraped) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              source: "musixmatch",
              sourceId: scraped.url,
              url: scraped.url,
              trackName: scraped.trackName,
              artistName: scraped.artistName,
              plainLyrics: scraped.plainLyrics,
              syncedLyrics: scraped.syncedLyrics,
              confidence: 60,
            },
          ],
        }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      )
    }

    return new Response(JSON.stringify({ candidates: [] }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Musixmatch unavailable", candidates: [] }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}
