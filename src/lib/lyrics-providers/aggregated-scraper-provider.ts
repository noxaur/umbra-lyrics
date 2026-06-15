import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import { simplifyTrackName } from "@/lib/parse-track-title"
import type { LyricsProvider, ProviderLyricsCandidate } from "./types"

type ScraperHit = {
  source: string
  sourceId: string
  url: string
  trackName: string
  artistName: string
  plainLyrics: string | null
  syncedLyrics: string | null
  confidence: number
}

type ScraperSearchResponse = {
  candidates?: ScraperHit[]
}

async function searchAggregatedScraper(
  artist: string,
  track: string,
  q?: string,
): Promise<ScraperHit[]> {
  const params = new URLSearchParams()
  if (q?.trim()) params.set("q", q.trim())
  if (artist.trim()) params.set("artist", artist.trim())
  if (track.trim()) params.set("track", track.trim())

  const res = await proxyFetch(`/api/lyrics/search?${params}`)
  if (!res.ok) return []
  const data = (await res.json()) as ScraperSearchResponse
  return data.candidates ?? []
}

function toCandidate(
  hit: ScraperHit,
  durationSec: number,
  artist: string,
  track: string,
): ProviderLyricsCandidate {
  const synced = Boolean(hit.syncedLyrics?.trim())
  return {
    providerId: "aggregated-scraper",
    externalId: `${hit.source}:${hit.sourceId}`,
    trackName: hit.trackName,
    artistName: hit.artistName,
    plainLyrics: hit.plainLyrics,
    syncedLyrics: hit.syncedLyrics,
    synced,
    confidence: scoreCandidate(
      {
        trackName: hit.trackName,
        artistName: hit.artistName,
        plainLyrics: hit.plainLyrics,
        syncedLyrics: hit.syncedLyrics,
      },
      durationSec,
      artist,
      track,
    ),
  }
}

export const aggregatedScraperProvider: LyricsProvider = {
  id: "aggregated-scraper",
  label: "Web scrapers",
  priority: 5,
  supportsSync: true,
  searchPhase: "Searching lyric sites…",
  async search(params) {
    const attempts = [
      { artist: params.artist, track: params.track },
      { artist: params.artist, track: simplifyTrackName(params.track) },
      { artist: params.oembedAuthor ?? "", track: params.track },
    ].filter((a) => a.track.trim())

    const seen = new Set<string>()
    const candidates: ProviderLyricsCandidate[] = []

    for (const { artist, track } of attempts) {
      const key = `${artist}\0${track}`
      if (seen.has(key)) continue
      seen.add(key)

      const q = [artist, track].filter(Boolean).join(" ")
      for (const hit of await searchAggregatedScraper(artist, track, q)) {
        candidates.push(toCandidate(hit, params.durationSec, params.artist, params.track))
      }
    }

    const best = pickBestCandidate(candidates, params.durationSec, params.artist, params.track)
    return best ? [best, ...candidates.filter((c) => c.externalId !== best.externalId).slice(0, 4)] : candidates.slice(0, 5)
  },
}
