import type { LyricsProviderId } from "@/types/lyrics"
import { rankHitScore } from "@/lib/lyrics-providers/match-utils"
import { lrclibProvider } from "@/lib/lyrics-providers/lrclib-provider"
import { lyricsOvhProvider } from "@/lib/lyrics-providers/lyrics-ovh-provider"
import { megalobizProvider } from "@/lib/lyrics-providers/megalobiz-provider"
import { musicbrainzProvider } from "@/lib/lyrics-providers/musicbrainz-provider"
import type {
  LyricsProvider,
  NormalizedLyricsResult,
  ProviderLyricsCandidate,
  ProviderSearchParams,
  RankedLyricsHit,
} from "./types"

export const ALL_LYRICS_PROVIDERS: LyricsProvider[] = [
  lrclibProvider,
  musicbrainzProvider,
  lyricsOvhProvider,
  megalobizProvider,
]

export const PROVIDER_FALLBACK_ORDER: LyricsProviderId[] = [
  "lrclib",
  "musicbrainz",
  "lyrics-ovh",
  "megalobiz",
]

export function getProviderById(id: LyricsProviderId): LyricsProvider | undefined {
  return ALL_LYRICS_PROVIDERS.find((p) => p.id === id)
}

export function candidateToResult(candidate: ProviderLyricsCandidate): NormalizedLyricsResult {
  return {
    providerId: candidate.providerId,
    id: candidate.externalId,
    plainLyrics: candidate.plainLyrics,
    syncedLyrics: candidate.syncedLyrics,
    synced: candidate.synced,
    trackName: candidate.trackName,
    artistName: candidate.artistName,
  }
}

export function rankCandidates(candidates: ProviderLyricsCandidate[]): ProviderLyricsCandidate[] {
  const providers = new Map(ALL_LYRICS_PROVIDERS.map((p) => [p.id, p]))
  return [...candidates].sort((a, b) => {
    const scoreA = rankHitScore({
      synced: a.synced,
      confidence: a.confidence,
      providerPriority: providers.get(a.providerId)?.priority ?? 99,
    })
    const scoreB = rankHitScore({
      synced: b.synced,
      confidence: b.confidence,
      providerPriority: providers.get(b.providerId)?.priority ?? 99,
    })
    return scoreA - scoreB
  })
}

export function pickBestHit(candidates: ProviderLyricsCandidate[]): RankedLyricsHit | null {
  const ranked = rankCandidates(candidates.filter((c) => c.plainLyrics?.trim() || c.syncedLyrics?.trim()))
  const best = ranked[0]
  if (!best) return null
  return { candidate: best, result: candidateToResult(best) }
}

export type MultiProviderSearchOptions = {
  params: ProviderSearchParams
  providerIds?: LyricsProviderId[]
  onProviderStart?: (providerId: LyricsProviderId, phase: string) => void
}

export async function searchProviders(
  options: MultiProviderSearchOptions,
): Promise<ProviderLyricsCandidate[]> {
  const { params, onProviderStart } = options
  const ids = options.providerIds ?? PROVIDER_FALLBACK_ORDER
  const providers = ids
    .map((id) => getProviderById(id))
    .filter((p): p is LyricsProvider => p != null)

  const results = await Promise.all(
    providers.map(async (provider) => {
      onProviderStart?.(provider.id, provider.searchPhase)
      try {
        return await provider.search(params)
      } catch {
        return []
      }
    }),
  )

  return results.flat()
}

export async function searchProvidersSequential(
  options: MultiProviderSearchOptions,
): Promise<RankedLyricsHit | null> {
  const { params, onProviderStart } = options
  const ids = options.providerIds ?? PROVIDER_FALLBACK_ORDER

  for (const id of ids) {
    const provider = getProviderById(id)
    if (!provider) continue
    onProviderStart?.(provider.id, provider.searchPhase)
    try {
      const candidates = await provider.search(params)
      const hit = pickBestHit(candidates)
      if (hit) return hit
    } catch {
      // try next provider
    }
  }

  return null
}
