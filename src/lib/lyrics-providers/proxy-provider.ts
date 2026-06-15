import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { detectLanguageHint } from "@/lib/lyrics-providers/normalize"
import { pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import {
  buildSearchAttempts,
  dedupeAttempts,
} from "@/lib/lyrics-providers/search-attempts"
import type { LyricsProviderId } from "@/types/lyrics"
import type { LyricsProvider, ProviderLyricsCandidate, ProviderSearchParams } from "./types"

export type ProxyHit = {
  id: string | number
  trackName: string
  artistName: string
  plainLyrics?: string | null
  syncedLyrics?: string | null
  languageHint?: string
}

type ProxySearchResponse = { results?: ProxyHit[] }

export type ProxyProviderConfig = {
  id: LyricsProviderId
  label: string
  priority: number
  supportsSync: boolean
  searchPhase: string
  apiPath: string
  defaultLanguageHint?: string
}

async function searchProxy(
  apiPath: string,
  artist: string,
  track: string,
): Promise<ProxyHit[]> {
  const q = new URLSearchParams({ artist, track })
  const res = await proxyFetch(`${apiPath}?${q}`)
  if (!res.ok) return []
  const data = (await res.json()) as ProxySearchResponse
  return data.results ?? []
}

export function createProxyLyricsProvider(config: ProxyProviderConfig): LyricsProvider {
  return {
    id: config.id,
    label: config.label,
    priority: config.priority,
    supportsSync: config.supportsSync,
    searchPhase: config.searchPhase,
    async search(params: ProviderSearchParams) {
      const attempts = dedupeAttempts(buildSearchAttempts(params))
      const candidates: ProviderLyricsCandidate[] = []

      for (const { artist, track } of attempts) {
        for (const hit of await searchProxy(config.apiPath, artist, track)) {
          const synced = Boolean(hit.syncedLyrics?.trim())
          const plainLyrics =
            hit.plainLyrics?.trim() ||
            (hit.syncedLyrics ? hit.syncedLyrics.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "").trim() : null) ||
            null

          if (!plainLyrics && !synced) continue

          const languageHint =
            hit.languageHint ??
            config.defaultLanguageHint ??
            (plainLyrics ? detectLanguageHint(plainLyrics) : undefined)

          candidates.push({
            providerId: config.id,
            externalId: hit.id,
            trackName: hit.trackName || track,
            artistName: hit.artistName || artist,
            plainLyrics,
            syncedLyrics: hit.syncedLyrics ?? null,
            synced,
            confidence: scoreCandidate(
              {
                trackName: hit.trackName || track,
                artistName: hit.artistName || artist,
                plainLyrics,
                syncedLyrics: hit.syncedLyrics,
              },
              params.durationSec,
              params.artist,
              params.track,
            ),
            languageHint,
          })
        }
      }

      const best = pickBestCandidate(candidates, params.durationSec, params.artist, params.track)
      return best ? [best] : candidates.slice(0, 3)
    },
  }
}
