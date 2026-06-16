import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import { buildSearchAttempts, dedupeAttempts } from "@/lib/lyrics-providers/search-attempts"
import { simplifyTrackName } from "@/lib/parse-track-title"
import type { LyricsProvider, ProviderLyricsCandidate } from "./types"

type MusixmatchHit = {
  source: string
  sourceId: string
  url: string
  trackName: string
  artistName: string
  plainLyrics: string | null
  syncedLyrics: string | null
  confidence: number
}

type MusixmatchResponse = {
  candidates?: MusixmatchHit[]
}

async function searchMusixmatch(artist: string, track: string): Promise<MusixmatchHit[]> {
  const params = new URLSearchParams({ artist, track })
  const res = await proxyFetch(`/api/lyrics/musixmatch/search?${params}`)
  if (!res.ok) return []
  const data = (await res.json()) as MusixmatchResponse
  return data.candidates ?? []
}

function toCandidate(
  hit: MusixmatchHit,
  durationSec: number,
  artist: string,
  track: string,
): ProviderLyricsCandidate {
  const synced = Boolean(hit.syncedLyrics?.trim())
  return {
    providerId: "musixmatch",
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

export const musixmatchProvider: LyricsProvider = {
  id: "musixmatch",
  label: "Musixmatch",
  priority: 1,
  supportsSync: true,
  searchPhase: "Searching Musixmatch…",
  async search(params) {
    const attempts = dedupeAttempts([
      ...buildSearchAttempts(params),
      ...(params.metadataAlternates ?? []).flatMap((alt) => [
        { artist: alt.artist, track: alt.track },
        { artist: alt.artist, track: simplifyTrackName(alt.track) },
      ]),
    ])

    const candidates: ProviderLyricsCandidate[] = []
    const settled = await Promise.allSettled(
      attempts.map(({ artist, track }) => searchMusixmatch(artist, track)),
    )

    for (const outcome of settled) {
      if (outcome.status !== "fulfilled") continue
      for (const hit of outcome.value) {
        candidates.push(toCandidate(hit, params.durationSec, params.artist, params.track))
      }
    }

    const best = pickBestCandidate(candidates, params.durationSec, params.artist, params.track)
    return best
      ? [best, ...candidates.filter((c) => c.externalId !== best.externalId).slice(0, 4)]
      : candidates.slice(0, 5)
  },
}
