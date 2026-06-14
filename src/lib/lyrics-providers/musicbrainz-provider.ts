import { searchByParams, searchByQuery } from "@/lib/lyrics-service"
import { simplifyTrackName } from "@/lib/parse-track-title"
import {
  fetchLrclibCandidate,
  lrclibSearchResultToCandidate,
} from "@/lib/lyrics-providers/lrclib-provider"
import { hasLyricsText, pickBestCandidate } from "@/lib/lyrics-providers/match-utils"
import type { LyricsProvider, ProviderLyricsCandidate, ProviderSearchParams } from "./types"

const MB_BASE = "https://musicbrainz.org/ws/2"
const MB_USER_AGENT = "song-kara/1.0.0 (https://github.com/song-kara)"
const MIN_REQUEST_GAP_MS = 1100

let lastMbRequestAt = 0

async function rateLimitedMbFetch(path: string): Promise<Response | null> {
  const now = Date.now()
  const wait = MIN_REQUEST_GAP_MS - (now - lastMbRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastMbRequestAt = Date.now()

  try {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { "User-Agent": MB_USER_AGENT, Accept: "application/json" },
    })
    return res.ok ? res : null
  } catch {
    return null
  }
}

type MbRecording = {
  id: string
  title: string
  length?: number
  "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>
}

type MbSearchResponse = { recordings?: MbRecording[] }

async function searchMusicBrainz(
  track: string,
  artist: string,
): Promise<Array<{ track: string; artist: string; durationSec?: number }>> {
  const queries = [
    artist.trim()
      ? `recording:"${track}" AND artist:"${artist}"`
      : `recording:"${track}"`,
    `${track} ${artist}`.trim(),
  ]

  const canonical: Array<{ track: string; artist: string; durationSec?: number }> = []
  const seen = new Set<string>()

  for (const query of queries) {
    const q = encodeURIComponent(query)
    const res = await rateLimitedMbFetch(`/recording?query=${q}&fmt=json&limit=5`)
    if (!res) continue

    const data = (await res.json()) as MbSearchResponse
    for (const rec of data.recordings ?? []) {
      const trackName = rec.title?.trim()
      if (!trackName) continue
      const artistName =
        rec["artist-credit"]?.[0]?.name?.trim() ||
        rec["artist-credit"]?.[0]?.artist?.name?.trim() ||
        ""
      const key = `${trackName}\0${artistName}`
      if (seen.has(key)) continue
      seen.add(key)
      canonical.push({
        track: trackName,
        artist: artistName,
        durationSec: rec.length ? Math.round(rec.length / 1000) : undefined,
      })
    }
  }

  return canonical
}

async function lrclibFromCanonical(
  canonical: { track: string; artist: string; durationSec?: number },
  params: ProviderSearchParams,
): Promise<ProviderLyricsCandidate[]> {
  const durationSec = canonical.durationSec ?? params.durationSec
  const results = [
    ...(await searchByParams(canonical.track, canonical.artist)),
    ...(await searchByQuery(`${canonical.track} ${canonical.artist}`.trim())),
  ]

  const candidates = results
    .filter((r) => hasLyricsText(r))
    .map((r) => lrclibSearchResultToCandidate(r, { ...params, durationSec }))

  const best = pickBestCandidate(candidates, durationSec, canonical.artist || params.artist)
  if (!best) return []

  const resolved = await fetchLrclibCandidate(best)
  return resolved && hasLyricsText(resolved) ? [{ ...resolved, providerId: "musicbrainz" }] : []
}

export const musicbrainzProvider: LyricsProvider = {
  id: "musicbrainz",
  label: "MusicBrainz",
  priority: 2,
  supportsSync: true,
  searchPhase: "Searching MusicBrainz → LRCLIB…",
  async search(params) {
    const track = simplifyTrackName(params.track) || params.track
    const canonicals = await searchMusicBrainz(track, params.artist)
    if (canonicals.length === 0) return []

    const hits: ProviderLyricsCandidate[] = []
    for (const canonical of canonicals.slice(0, 3)) {
      const found = await lrclibFromCanonical(canonical, params)
      hits.push(...found)
    }
    return hits
  },
}

/** Reset rate limiter between test runs. */
export function resetMusicBrainzRateLimitForTests(): void {
  lastMbRequestAt = 0
}
