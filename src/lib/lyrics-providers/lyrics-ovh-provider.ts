import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import { simplifyTrackName } from "@/lib/parse-track-title"
import type { LyricsProvider, ProviderLyricsCandidate } from "./types"

type OvhResponse = { lyrics?: string; error?: string }

function encodePath(value: string): string {
  return encodeURIComponent(value.trim())
}

async function fetchOvhLyrics(artist: string, track: string): Promise<string | null> {
  const path = `/api/lyrics/ovh/${encodePath(artist)}/${encodePath(track)}`
  const res = await proxyFetch(path)
  if (!res.ok) return null

  const data = (await res.json()) as OvhResponse
  const lyrics = data.lyrics?.trim()
  return lyrics || null
}

export const lyricsOvhProvider: LyricsProvider = {
  id: "lyrics-ovh",
  label: "lyrics.ovh",
  priority: 3,
  supportsSync: false,
  searchPhase: "Trying lyrics.ovh…",
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

      const lyrics = await fetchOvhLyrics(artist, track)
      if (!lyrics) continue

      const candidate: ProviderLyricsCandidate = {
        providerId: "lyrics-ovh",
        externalId: key,
        trackName: track,
        artistName: artist,
        plainLyrics: lyrics,
        syncedLyrics: null,
        synced: false,
        confidence: scoreCandidate(
          { trackName: track, artistName: artist },
          params.durationSec,
          params.artist,
        ),
      }
      candidates.push(candidate)
    }

    const best = pickBestCandidate(candidates, params.durationSec, params.artist)
    return best ? [best] : candidates
  },
}
