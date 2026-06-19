import type { LyricsProviderId } from "@/types/lyrics"
import {
  countLyricLines,
  pickBestAndAlternates,
  rankLyricsCandidate,
  rankLyricsCandidates,
  RANK_WEIGHTS,
} from "@/lib/lyrics-ranking"
import { hasLyricsText, pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import { musixmatchProvider } from "@/lib/lyrics-providers/musixmatch-provider"
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

/** LRCLIB often responds in 10–15s from the edge; shorter timeouts cause scraper junk to win. */
export const LRCLIB_TIMEOUT_MS = 45_000

export function providerTimeoutMs(providerId: LyricsProviderId): number {
  if (providerId === "lrclib") return LRCLIB_TIMEOUT_MS
  return PROVIDER_TIMEOUT_MS
}

export const ALL_LYRICS_PROVIDERS: LyricsProvider[] = [
  musixmatchProvider,
  lrclibProvider,
  megalobizProvider,
  musicbrainzProvider,
  lyricsOvhProvider,
  chartlyricsProvider,
  geniusProvider,
  petitlyricsProvider,
  lyricstranslateProvider,
  animelyricsProvider,
  vagalumeProvider,
  lyricswikiProvider,
  songmeaningsProvider,
  letrasProvider,
  aggregatedScraperProvider,
]

export const PROVIDER_FALLBACK_ORDER: LyricsProviderId[] = [
  "musixmatch",
  "lrclib",
  "megalobiz",
  "musicbrainz",
  "lyrics-ovh",
  "genius",
  "petitlyrics",
  "lyricstranslate",
  "animelyrics",
  "vagalume",
  "lyricswiki",
  "songmeanings",
  "letras",
  "chartlyrics",
  "aggregated-scraper",
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
  fallbackDelayMs?: number
  preferredProviderGraceMs?: number
  earlyExitOnDefinitiveLrclib?: boolean
  onProviderStart?: (providerId: LyricsProviderId, phase: string) => void
  onProviderComplete?: (status: ProviderSearchStatus) => void
}

const STAGED_FALLBACK_DELAY_MS = 1_200
const PREFERRED_PROVIDER_GRACE_MS = 15_000

const FIRST_STAGE_PROVIDER_IDS = new Set<LyricsProviderId>([
  "musixmatch",
  "lrclib",
  "megalobiz",
  "musicbrainz",
])

/** LRCLIB synced + strong metadata match cannot be beaten by lower-priority providers. */
export function isDefinitiveLrclibSyncedWin(
  candidates: ProviderLyricsCandidate[],
  params: ProviderSearchParams,
): boolean {
  const lrclibSynced = candidates.filter(
    (c) => c.providerId === "lrclib" && c.synced && hasLyricsText(c) && !c.instrumental,
  )
  const best = pickBestCandidate(lrclibSynced, params.durationSec, params.artist, params.track)
  if (!best) return false
  if (countLyricLines(best) < RANK_WEIGHTS.MIN_LINES_FOR_FULL) return false
  return scoreCandidate(best, params.durationSec, params.artist, params.track) < 80
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
  const earlyExit = options.earlyExitOnDefinitiveLrclib ?? true
  const ids = options.providerIds ?? PROVIDER_FALLBACK_ORDER
  const providers = ids
    .map((id) => getProviderById(id))
    .filter((p): p is LyricsProvider => p != null)

  if (providers.length === 0) return { candidates: [], statuses: [] }

  const statuses: ProviderSearchStatus[] = []
  const buckets: ProviderLyricsCandidate[][] = providers.map(() => [])
  let completed = 0
  let settled = false

  return new Promise((resolve) => {
    const recordStatus = (status: ProviderSearchStatus) => {
      if (settled) return
      statuses.push(status)
      onProviderComplete?.(status)
    }

    const finish = (early: boolean) => {
      if (settled) return
      if (early || completed >= providers.length) {
        settled = true
        resolve({ candidates: buckets.flat(), statuses: [...statuses] })
      }
    }

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i]!
      const index = i
      onProviderStart?.(provider.id, provider.searchPhase)
      void (async () => {
        const providerTimeout = options.timeoutMs ?? providerTimeoutMs(provider.id)
        try {
          const candidates = await searchOneProvider(provider, params, providerTimeout)
          buckets[index] = candidates
          recordStatus({
            providerId: provider.id,
            outcome: candidates.length > 0 ? "found" : "empty",
            candidateCount: candidates.length,
          })
          if (
            earlyExit &&
            provider.id === "lrclib" &&
            isDefinitiveLrclibSyncedWin(candidates, params)
          ) {
            finish(true)
          }
        } catch (error) {
          const outcome: ProviderSearchOutcome =
            error instanceof Error && error.message === "timeout" ? "timeout" : "error"
          recordStatus({
            providerId: provider.id,
            outcome,
            candidateCount: 0,
            message: error instanceof Error ? error.message : "Unknown error",
          })
        } finally {
          completed += 1
          finish(false)
        }
      })()
    }
  })
}

function buildProviderStages(providerIds: LyricsProviderId[]): LyricsProviderId[][] {
  const firstStage = providerIds.filter((id) => FIRST_STAGE_PROVIDER_IDS.has(id))
  const fallbackStage = providerIds.filter((id) => !FIRST_STAGE_PROVIDER_IDS.has(id))
  return [firstStage, fallbackStage].filter((stage) => stage.length > 0)
}

export async function searchProvidersStaged(
  options: MultiProviderSearchOptions,
): Promise<{ candidates: ProviderLyricsCandidate[]; statuses: ProviderSearchStatus[] }> {
  const providerIds = options.providerIds ?? PROVIDER_FALLBACK_ORDER
  const stages = buildProviderStages(providerIds)
  const firstStage = stages[0] ?? []
  const fallbackStage = stages[1] ?? []

  if (fallbackStage.length === 0) {
    return searchProvidersParallel({ ...options, providerIds: firstStage })
  }

  const providersById = new Map(ALL_LYRICS_PROVIDERS.map((provider) => [provider.id, provider]))
  const fallbackDelayMs = options.fallbackDelayMs ?? STAGED_FALLBACK_DELAY_MS
  const preferredProviderGraceMs =
    options.preferredProviderGraceMs ?? PREFERRED_PROVIDER_GRACE_MS
  const candidates: ProviderLyricsCandidate[] = []
  const statuses: ProviderSearchStatus[] = []

  let firstPending = 0
  let fallbackPending = 0
  let fallbackFoundCandidates = false
  let fallbackStarted = false
  let fallbackDone = false
  let settled = false
  let preferredProviderGraceTimer: ReturnType<typeof setTimeout> | null = null

  const settle = (
    resolve: (value: {
      candidates: ProviderLyricsCandidate[]
      statuses: ProviderSearchStatus[]
    }) => void,
  ) => {
    if (settled) return
    settled = true
    if (preferredProviderGraceTimer) clearTimeout(preferredProviderGraceTimer)
    resolve({ candidates: [...candidates], statuses: [...statuses] })
  }

  return new Promise((resolve) => {
    const startPreferredProviderGrace = () => {
      if (
        settled ||
        preferredProviderGraceTimer != null ||
        !fallbackFoundCandidates ||
        firstPending === 0
      ) {
        return
      }
      if (preferredProviderGraceMs <= 0) {
        settle(resolve)
        return
      }
      preferredProviderGraceTimer = setTimeout(
        () => settle(resolve),
        preferredProviderGraceMs,
      )
    }

    const finish = () => {
      if (settled) return

      if (
        options.earlyExitOnDefinitiveLrclib !== false &&
        isDefinitiveLrclibSyncedWin(candidates, options.params)
      ) {
        settle(resolve)
        return
      }

      startPreferredProviderGrace()

      if (!fallbackStarted && firstPending === 0) {
        startStage(fallbackStage, "fallback")
        return
      }

      if (!fallbackStarted || !fallbackDone) return

      if (firstPending === 0) {
        settle(resolve)
      }
    }

    const recordStatus = (status: ProviderSearchStatus) => {
      if (settled) return
      statuses.push(status)
      options.onProviderComplete?.(status)
    }

    const startStage = (ids: LyricsProviderId[], stage: "first" | "fallback") => {
      if (stage === "fallback") {
        if (fallbackStarted) return
        fallbackStarted = true
        fallbackPending = ids.length
        if (fallbackPending === 0) {
          fallbackDone = true
          finish()
          return
        }
      } else {
        firstPending = ids.length
      }

      for (const id of ids) {
        const provider = providersById.get(id)
        if (!provider) {
          if (stage === "first") firstPending -= 1
          else fallbackPending -= 1
          continue
        }

        options.onProviderStart?.(provider.id, provider.searchPhase)
        void (async () => {
          const providerTimeout = options.timeoutMs ?? providerTimeoutMs(provider.id)
          try {
            const providerCandidates = await searchOneProvider(
              provider,
              options.params,
              providerTimeout,
            )
            if (stage === "fallback" && providerCandidates.length > 0) {
              fallbackFoundCandidates = true
            }
            if (!settled) candidates.push(...providerCandidates)
            recordStatus({
              providerId: provider.id,
              outcome: providerCandidates.length > 0 ? "found" : "empty",
              candidateCount: providerCandidates.length,
            })
          } catch (error) {
            const outcome: ProviderSearchOutcome =
              error instanceof Error && error.message === "timeout" ? "timeout" : "error"
            recordStatus({
              providerId: provider.id,
              outcome,
              candidateCount: 0,
              message: error instanceof Error ? error.message : "Unknown error",
            })
          } finally {
            if (stage === "first") firstPending -= 1
            else {
              fallbackPending -= 1
              fallbackDone = fallbackPending === 0
            }
            finish()
          }
        })()
      }

      if (stage === "first" && firstPending === 0) {
        finish()
      } else if (stage === "fallback" && fallbackPending === 0) {
        fallbackDone = true
        finish()
      }
    }

    startStage(firstStage, "first")
    setTimeout(() => {
      if (!settled && !fallbackStarted) startStage(fallbackStage, "fallback")
    }, fallbackDelayMs)
  })
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
