import type { LyricsProviderId } from "@/types/lyrics"
import {
  pickBestAndAlternates,
  rankLyricsCandidate,
  rankLyricsCandidates,
} from "@/lib/lyrics-ranking"
import { aggregatedScraperProvider } from "@/lib/lyrics-providers/aggregated-scraper-provider"
import { animelyricsProvider } from "@/lib/lyrics-providers/animelyrics-provider"
import { chartlyricsProvider } from "@/lib/lyrics-providers/chartlyrics-provider"
import { geniusProvider } from "@/lib/lyrics-providers/genius-provider"
import { letrasProvider } from "@/lib/lyrics-providers/letras-provider"
import { lrclibProvider } from "@/lib/lyrics-providers/lrclib-provider"
import { lyricsOvhProvider } from "@/lib/lyrics-providers/lyrics-ovh-provider"
import { lyricstranslateProvider } from "@/lib/lyrics-providers/lyricstranslate-provider"
import { lyricswikiProvider } from "@/lib/lyrics-providers/lyricswiki-provider"
import { megalobizProvider } from "@/lib/lyrics-providers/megalobiz-provider"
import { musicbrainzProvider } from "@/lib/lyrics-providers/musicbrainz-provider"
import { petitlyricsProvider } from "@/lib/lyrics-providers/petitlyrics-provider"
import { songmeaningsProvider } from "@/lib/lyrics-providers/songmeanings-provider"
import { vagalumeProvider } from "@/lib/lyrics-providers/vagalume-provider"
import type {
  LyricsProvider,
  NormalizedLyricsResult,
  ProviderLyricsCandidate,
  ProviderSearchParams,
  RankedLyricsHit,
} from "./types"

export const PROVIDER_TIMEOUT_MS = 8000

export const ALL_LYRICS_PROVIDERS: LyricsProvider[] = [
  lrclibProvider,
  musicbrainzProvider,
  lyricsOvhProvider,
  megalobizProvider,
  aggregatedScraperProvider,
  chartlyricsProvider,
  geniusProvider,
  petitlyricsProvider,
  lyricstranslateProvider,
  animelyricsProvider,
  vagalumeProvider,
  lyricswikiProvider,
  songmeaningsProvider,
  letrasProvider,
]

export const PROVIDER_FALLBACK_ORDER: LyricsProviderId[] = [
  "lrclib",
  "musicbrainz",
  "lyrics-ovh",
  "megalobiz",
  "aggregated-scraper",
  "chartlyrics",
  "genius",
  "petitlyrics",
  "lyricstranslate",
  "animelyrics",
  "vagalume",
  "lyricswiki",
  "songmeanings",
  "letras",
]

export type ProviderSearchOutcome = "found" | "empty" | "error" | "timeout"

export type ProviderSearchStatus = {
  providerId: LyricsProviderId
  outcome: ProviderSearchOutcome
  candidateCount: number
  message?: string
}

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
    languageHint: candidate.languageHint,
  }
}

function buildRankContext(params: ProviderSearchParams) {
  const providers = new Map(ALL_LYRICS_PROVIDERS.map((p) => [p.id, p]))
  return {
    durationSec: params.durationSec,
    artist: params.artist,
    track: params.track,
    preferredLanguage: params.preferredLanguage,
    providerPriority: (id: LyricsProviderId) => providers.get(id)?.priority ?? 99,
  }
}

export function rankCandidates(candidates: ProviderLyricsCandidate[]): ProviderLyricsCandidate[] {
  return rankLyricsCandidates(candidates, buildRankContext({ track: "", artist: "", durationSec: 0 }))
    .map((r) => r.candidate)
}

export function rankCandidatesWithParams(
  candidates: ProviderLyricsCandidate[],
  params: ProviderSearchParams,
): ReturnType<typeof rankLyricsCandidates> {
  return rankLyricsCandidates(candidates, buildRankContext(params))
}

export function pickBestHit(
  candidates: ProviderLyricsCandidate[],
  params?: ProviderSearchParams,
): RankedLyricsHit | null {
  const context = buildRankContext(
    params ?? { track: "", artist: "", durationSec: 0 },
  )
  const { best } = pickBestAndAlternates(
    candidates.filter((c) => c.plainLyrics?.trim() || c.syncedLyrics?.trim()),
    context,
  )
  if (!best) return null
  return { candidate: best.candidate, result: candidateToResult(best.candidate) }
}

export type MultiProviderSearchOptions = {
  params: ProviderSearchParams
  providerIds?: LyricsProviderId[]
  timeoutMs?: number
  onProviderStart?: (providerId: LyricsProviderId, phase: string) => void
  onProviderComplete?: (status: ProviderSearchStatus) => void
}

async function searchOneProvider(
  provider: LyricsProvider,
  params: ProviderSearchParams,
  timeoutMs: number,
): Promise<ProviderLyricsCandidate[]> {
  return Promise.race([
    provider.search(params),
    new Promise<ProviderLyricsCandidate[]>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    }),
  ])
}

export async function searchProviders(
  options: MultiProviderSearchOptions,
): Promise<ProviderLyricsCandidate[]> {
  const result = await searchProvidersParallel(options)
  return result.candidates
}

export async function searchProvidersParallel(
  options: MultiProviderSearchOptions,
): Promise<{ candidates: ProviderLyricsCandidate[]; statuses: ProviderSearchStatus[] }> {
  const { params, onProviderStart, onProviderComplete } = options
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS
  const ids = options.providerIds ?? PROVIDER_FALLBACK_ORDER
  const providers = ids
    .map((id) => getProviderById(id))
    .filter((p): p is LyricsProvider => p != null)

  const statuses: ProviderSearchStatus[] = []

  const results = await Promise.all(
    providers.map(async (provider) => {
      onProviderStart?.(provider.id, provider.searchPhase)
      try {
        const candidates = await searchOneProvider(provider, params, timeoutMs)
        const status: ProviderSearchStatus = {
          providerId: provider.id,
          outcome: candidates.length > 0 ? "found" : "empty",
          candidateCount: candidates.length,
        }
        statuses.push(status)
        onProviderComplete?.(status)
        return candidates
      } catch (error) {
        const outcome: ProviderSearchOutcome =
          error instanceof Error && error.message === "timeout" ? "timeout" : "error"
        const status: ProviderSearchStatus = {
          providerId: provider.id,
          outcome,
          candidateCount: 0,
          message: error instanceof Error ? error.message : "Unknown error",
        }
        statuses.push(status)
        onProviderComplete?.(status)
        return []
      }
    }),
  )

  return { candidates: results.flat(), statuses }
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
      const hit = pickBestHit(candidates, params)
      if (hit) return hit
    } catch {
      // try next provider
    }
  }

  return null
}

export { rankLyricsCandidate }
