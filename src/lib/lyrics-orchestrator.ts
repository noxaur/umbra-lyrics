import type { LyricsAlternate, LyricsProviderId, LyricsResult } from "@/types/lyrics"
import {
  candidateToResult,
  getProviderById,
  pickBestHit,
  PROVIDER_FALLBACK_ORDER,
  rankCandidatesWithParams,
  searchProvidersParallel,
  type ProviderSearchStatus,
} from "@/lib/lyrics-providers/index"
import { pickBestAndAlternates } from "@/lib/lyrics-ranking"
import { tryMetadataLyricsFallback } from "@/lib/metadata-lyrics-fallback"
import type { ProviderLyricsCandidate, ProviderSearchParams } from "@/lib/lyrics-providers/types"

export type LyricsSearchAttempt = {
  strategy: string
  provider?: LyricsProviderId
  result: "found" | "empty" | "error" | "skipped" | "timeout"
  message?: string
}

export type LyricsOrchestratorStatus = "found" | "partial" | "not_found" | "instrumental"

export type LyricsOrchestratorResult = {
  status: LyricsOrchestratorStatus
  strategy: string
  providerId?: LyricsProviderId
  attempts: LyricsSearchAttempt[]
  providersTried: LyricsProviderId[]
  lyrics?: LyricsResult
  alternates?: LyricsAlternate[]
  message: string
  matchId?: number | string
  instrumental?: boolean
  synced: boolean
}

export type LyricsSearchStep = "parse" | "search" | "match" | "ready"

export type OrchestratorProgress = {
  phase: string
  step: LyricsSearchStep
  provider?: LyricsProviderId
  providersTotal?: number
  providersTried?: LyricsProviderId[]
  retryRound?: number
  maxRetries?: number
}

export type OrchestratorParams = {
  track: string
  artist: string
  title: string
  durationSec: number
  oembedAuthor?: string
  preferredLanguage?: string
  providerIds?: LyricsProviderId[]
  onProgress?: (update: OrchestratorProgress) => void
}

function toProviderParams(params: OrchestratorParams): ProviderSearchParams {
  return {
    track: params.track,
    artist: params.artist,
    durationSec: params.durationSec,
    title: params.title,
    oembedAuthor: params.oembedAuthor,
    preferredLanguage: params.preferredLanguage,
  }
}

function statusToAttemptResult(outcome: ProviderSearchStatus["outcome"]): LyricsSearchAttempt["result"] {
  if (outcome === "timeout") return "timeout"
  if (outcome === "error") return "error"
  if (outcome === "found") return "found"
  return "empty"
}

function toAlternate(ranked: {
  candidate: ProviderLyricsCandidate
  score: number
  lineCount: number
}): LyricsAlternate {
  const result = candidateToResult(ranked.candidate)
  return {
    providerId: ranked.candidate.providerId,
    id: ranked.candidate.externalId,
    trackName: ranked.candidate.trackName,
    artistName: ranked.candidate.artistName,
    synced: ranked.candidate.synced,
    lineCount: ranked.lineCount,
    rankScore: ranked.score,
    lyricsResult: result,
  }
}

function successResult(
  strategy: string,
  attempts: LyricsSearchAttempt[],
  providersTried: LyricsProviderId[],
  lyrics: LyricsResult,
  synced: boolean,
  alternates: LyricsAlternate[],
  matchId?: number | string,
  instrumental?: boolean,
  message?: string,
): LyricsOrchestratorResult {
  return {
    status: instrumental ? "instrumental" : "found",
    strategy,
    providerId: lyrics.providerId,
    attempts,
    providersTried,
    lyrics,
    alternates,
    message: message ?? (synced ? "Found synced lyrics" : "Found plain lyrics"),
    matchId,
    instrumental,
    synced,
  }
}

export async function orchestrateLyricsSearch(
  params: OrchestratorParams,
): Promise<LyricsOrchestratorResult> {
  const attempts: LyricsSearchAttempt[] = []
  const providersTried: LyricsProviderId[] = []
  const providerIds = params.providerIds ?? PROVIDER_FALLBACK_ORDER

  const report = (
    phase: string,
    step: LyricsSearchStep,
    extra?: Partial<OrchestratorProgress>,
  ) => {
    params.onProgress?.({
      phase,
      step,
      providersTotal: providerIds.length,
      providersTried: [...providersTried],
      ...extra,
    })
  }

  report("Parsing title…", "parse")

  const providerParams = toProviderParams(params)

  report(`Searching ${providerIds.length} sources…`, "search")

  const { candidates, statuses } = await searchProvidersParallel({
    params: providerParams,
    providerIds,
    onProviderStart: (providerId) => {
      if (!providersTried.includes(providerId)) providersTried.push(providerId)
      const label = getProviderById(providerId)?.label ?? providerId
      report(`Searching ${providerIds.length} sources… (${label})`, "search", { provider: providerId })
    },
    onProviderComplete: (status) => {
      attempts.push({
        strategy: status.providerId,
        provider: status.providerId,
        result: statusToAttemptResult(status.outcome),
        message:
          status.outcome === "timeout"
            ? "Timed out"
            : status.outcome === "error"
              ? status.message
              : status.candidateCount === 0
                ? "No matches"
                : `${status.candidateCount} candidate${status.candidateCount === 1 ? "" : "s"}`,
      })
    },
  })

  report("Ranking results…", "match")

  const rankContext = {
    durationSec: params.durationSec,
    artist: params.artist,
    track: params.track,
    preferredLanguage: params.preferredLanguage,
    providerPriority: (id: LyricsProviderId) => getProviderById(id)?.priority ?? 99,
  }

  const { best, alternates: rankedAlternates } = pickBestAndAlternates(candidates, rankContext)

  if (best && (best.candidate.plainLyrics?.trim() || best.candidate.syncedLyrics?.trim())) {
    const lyrics = candidateToResult(best.candidate)
    const synced = Boolean(lyrics.syncedLyrics?.trim())
    const alternateOptions = rankedAlternates.map(toAlternate)
    const providerLabel = getProviderById(lyrics.providerId)?.label ?? lyrics.providerId
    const altCount = alternateOptions.length

    report(
      altCount > 0
        ? `Used ${providerLabel} (${altCount} alternative${altCount === 1 ? "" : "s"} found)`
        : synced
          ? "Found synced lyrics"
          : "Found plain lyrics",
      "ready",
      { provider: lyrics.providerId },
    )

    return successResult(
      "parallel_ranked",
      attempts,
      providersTried,
      lyrics,
      synced,
      alternateOptions,
      lyrics.id,
      best.candidate.instrumental,
      altCount > 0
        ? `Used ${providerLabel} (${altCount} alternative${altCount === 1 ? "" : "s"} found)`
        : undefined,
    )
  }

  const rankedAll = rankCandidatesWithParams(candidates, providerParams)
  const emptyMatch = rankedAll.find(
    (r) => !r.candidate.plainLyrics?.trim() && !r.candidate.syncedLyrics?.trim(),
  )?.candidate

  if (emptyMatch) {
    report("Song found but no lyrics in database", "ready")
    return {
      status: emptyMatch.instrumental ? "instrumental" : "partial",
      strategy: "metadata_only",
      providerId: emptyMatch.providerId,
      attempts,
      providersTried,
      message: "Song found but no lyrics in database",
      matchId: emptyMatch.externalId,
      instrumental: emptyMatch.instrumental,
      synced: false,
    }
  }

  const metadataHit = await tryMetadataLyricsFallback(params, attempts, providersTried, (phase) =>
    report(phase, "search"),
  )
  if (metadataHit) {
    report(metadataHit.synced ? "Found synced lyrics" : "Found plain lyrics", "ready", {
      provider: metadataHit.providerId,
    })
    return metadataHit
  }

  const anyFound = statuses.some((s) => s.outcome === "found")
  const allTimedOut = statuses.length > 0 && statuses.every((s) => s.outcome === "timeout")

  report("No lyrics — you can paste or edit", "ready")
  return {
    status: "not_found",
    strategy: "none",
    attempts,
    providersTried,
    message: allTimedOut
      ? "Lyrics sources timed out — try again or paste lyrics"
      : anyFound
        ? "Matches found but no lyric text available"
        : "No lyrics — you can paste or edit",
    synced: false,
  }
}

/** @deprecated Use parallel orchestration; kept for tests importing pick flow */
export async function orchestrateSingleProvider(
  params: OrchestratorParams,
  providerId: LyricsProviderId,
): Promise<LyricsOrchestratorResult> {
  return orchestrateLyricsSearch({ ...params, providerIds: [providerId] })
}

export { pickBestHit }
