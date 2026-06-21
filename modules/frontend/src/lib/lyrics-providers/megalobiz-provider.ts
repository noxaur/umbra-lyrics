import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import { simplifyTrackName } from "@/lib/parse-track-title"
import type { LyricsProvider, ProviderLyricsCandidate } from "./types"

type MegalobizHit = {
  id: string
  trackName: string
  artistName: string
  syncedLyrics: string
  plainLyrics: string | null
}

type MegalobizResponse = { results?: MegalobizHit[] }

async function searchMegalobiz(artist: string, track: string): Promise<MegalobizHit[]> {
  const q = new URLSearchParams({ artist, track })
  const res = await proxyFetch(`/api/lyrics/megalobiz/search?${q}`)
  if (!res.ok) return []
  const data = (await res.json()) as MegalobizResponse
  return data.results ?? []
}

export const megalobizProvider: LyricsProvider = {
  id: "megalobiz",
  label: "Megalobiz",
  priority: 3,
  supportsSync: true,
  searchPhase: "Trying Megalobiz…",
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

      for (const hit of await searchMegalobiz(artist, track)) {
        const synced = Boolean(hit.syncedLyrics?.trim())
        candidates.push({
          providerId: "megalobiz",
          externalId: hit.id,
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
            params.durationSec,
            params.artist,
            params.track,
          ),
        })
      }
    }

    const best = pickBestCandidate(candidates, params.durationSec, params.artist, params.track)
    return best ? [best] : candidates.slice(0, 3)
  },
}
