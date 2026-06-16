import type { EnglishLyricsResult } from "@/lib/english-lyrics-service"
import { resolveEnglishLyrics } from "@/lib/english-lyrics-service"
import { detectLanguage } from "@/lib/language-service"
import {
  assessContentType,
  buildTranscriptProfile,
  isStrongVerification,
  passesVerification,
  shouldPromoteTranscription,
  verifyAllCandidates,
  type ContentAssessment,
  type TranscriptProfile,
} from "@/lib/lyrics-verification"
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
import { sampleTranscribeForVerification, fullTranscribeAsProvider } from "@/lib/transcription-service"
import type { ResolvedTrackMetadata } from "@/lib/track-metadata-resolver"

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
  verificationScore?: number
  contentAssessment?: ContentAssessment
  transcriptProfile?: TranscriptProfile
  english?: EnglishLyricsResult
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
  videoId?: string
  oembedAuthor?: string
  preferredLanguage?: string
  providerIds?: LyricsProviderId[]
  resolvedMetadata?: ResolvedTrackMetadata
  onProgress?: (update: OrchestratorProgress) => void
}

function toProviderParams(params: OrchestratorParams): ProviderSearchParams {
  const meta = params.resolvedMetadata
  return {
    track: params.track,
    artist: params.artist,
    durationSec: params.durationSec,
    title: params.title,
    oembedAuthor: params.oembedAuthor,
    preferredLanguage: params.preferredLanguage,
    canonicalArtist: meta?.artist,
    canonicalTrack: meta?.track,
    metadataAlternates: meta?.alternates,
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
  extras?: Partial<LyricsOrchestratorResult>,
): LyricsOrchestratorResult {
  return {
    status: extras?.instrumental ? "instrumental" : "found",
    strategy,
    providerId: lyrics.providerId,
    attempts,
    providersTried,
    lyrics,
    alternates,
    message: extras?.message ?? (synced ? "Found synced lyrics" : "Found plain lyrics"),
    matchId: extras?.matchId ?? lyrics.id,
    instrumental: extras?.instrumental,
    synced,
    verificationScore: extras?.verificationScore,
    contentAssessment: extras?.contentAssessment,
    transcriptProfile: extras?.transcriptProfile,
    english: extras?.english,
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

  const samplePromise =
    params.videoId
      ? sampleTranscribeForVerification({
          videoId: params.videoId,
          artist: params.artist,
          track: params.track,
          language: params.preferredLanguage,
          durationSec: Math.round(params.durationSec) || undefined,
        })
      : Promise.resolve(null)

  report(`Searching ${providerIds.length} sources…`, "search")

  const [{ candidates, statuses }, sampleTranscript] = await Promise.all([
    searchProvidersParallel({
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
    }),
    samplePromise,
  ])

  const transcriptProfile = sampleTranscript
    ? buildTranscriptProfile(sampleTranscript.segments, {
        language: sampleTranscript.language,
        coverageSec: sampleTranscript.coverageSec,
      })
    : null

  const contentAssessment = assessContentType(transcriptProfile)

  report("Verifying against audio…", "match")

  const verified = verifyAllCandidates(candidates, transcriptProfile)
  const verificationMap = new Map(
    verified.map((v) => [v.candidate.externalId, v.verification.score]),
  )

  const rankContext = {
    durationSec: params.durationSec,
    artist: params.artist,
    track: params.track,
    preferredLanguage: params.preferredLanguage,
    providerPriority: (id: LyricsProviderId) => getProviderById(id)?.priority ?? 99,
    verificationScore: (candidate: ProviderLyricsCandidate) =>
      verificationMap.get(candidate.externalId),
  }

  const verifiedCandidates = verified
    .filter((v) => passesVerification(v.verification) || !transcriptProfile)
    .map((v) => v.candidate)

  const pool = verifiedCandidates.length > 0 ? verifiedCandidates : candidates
  const { best, alternates: rankedAlternates } = pickBestAndAlternates(pool, rankContext)

  const bestVerification = best
    ? verified.find((v) => v.candidate.externalId === best.candidate.externalId)?.verification
    : undefined

  const promoteVideoId = params.videoId
  const shouldPromote = Boolean(
    promoteVideoId &&
      shouldPromoteTranscription(bestVerification, transcriptProfile, contentAssessment),
  )

  if (shouldPromote && promoteVideoId) {
    report("Transcribing from audio…", "match")
    attempts.push({
      strategy: "transcription:promote",
      provider: "transcription",
      result: "skipped",
      message: "Provider verification below threshold — using audio transcription",
    })

    const transcription = await fullTranscribeAsProvider({
      videoId: promoteVideoId,
      artist: params.artist,
      track: params.track,
      language: params.preferredLanguage,
      durationSec: Math.round(params.durationSec) || undefined,
    })

    if (transcription?.candidate.plainLyrics?.trim()) {
      if (!providersTried.includes("transcription")) providersTried.push("transcription")
      attempts.push({
        strategy: "transcription:primary",
        provider: "transcription",
        result: "found",
        message: transcription.partial ? "Partial transcript" : "Full transcript",
      })

      const lyrics = candidateToResult(transcription.candidate)
      const nativeLines = lyrics.plainLyrics?.split("\n").filter(Boolean) ?? []
      const lang = detectLanguage(nativeLines.join("\n"))
      const english = await resolveEnglishLyrics({
        track: params.track,
        artist: params.artist,
        nativeLines,
        language: lang,
        durationSec: params.durationSec,
        videoId: params.videoId,
        onProgress: (phase) => report(phase, "search"),
      })

      report(
        transcription.partial
          ? "Transcribed partial audio — timing may drift on long tracks"
          : "Transcribed from audio",
        "ready",
        { provider: "transcription" },
      )

      return successResult(
        "transcription_primary",
        attempts,
        providersTried,
        lyrics,
        false,
        [],
        {
          matchId: lyrics.id,
          verificationScore: 1,
          contentAssessment,
          transcriptProfile: transcriptProfile ?? undefined,
          english,
          message: transcription.partial
            ? "Transcribed partial audio — timing may drift on long tracks"
            : "Transcribed from audio",
        },
      )
    }

    attempts.push({
      strategy: "transcription:promote",
      provider: "transcription",
      result: "error",
      message: "Full transcription failed after weak provider match",
    })
  }

  const skipWeakProvider = shouldPromote

  if (
    !skipWeakProvider &&
    best &&
    (best.candidate.plainLyrics?.trim() || best.candidate.syncedLyrics?.trim())
  ) {
    const lyrics = candidateToResult(best.candidate)
    const synced = Boolean(lyrics.syncedLyrics?.trim())
    const alternateOptions = rankedAlternates.map(toAlternate)
    const providerLabel = getProviderById(lyrics.providerId)?.label ?? lyrics.providerId
    const altCount = alternateOptions.length
    const verifiedLabel =
      bestVerification && isStrongVerification(bestVerification)
        ? " (verified against audio)"
        : ""

    report("Fetching English lyrics…", "search")

    const nativeLines = (lyrics.plainLyrics ?? lyrics.syncedLyrics ?? "")
      .replace(/\[[\d:.]+\]/g, "")
      .split("\n")
      .filter(Boolean)
    const lang = detectLanguage(nativeLines.join("\n"))
    const english = await resolveEnglishLyrics({
      track: params.track,
      artist: params.artist,
      nativeLines,
      language: lang,
      durationSec: params.durationSec,
      videoId: params.videoId,
      onProgress: (phase) => report(phase, "search"),
    })

    report(
      altCount > 0
        ? `Used ${providerLabel}${verifiedLabel} (${altCount} alternative${altCount === 1 ? "" : "s"} found)`
        : synced
          ? `Found synced lyrics${verifiedLabel}`
          : `Found plain lyrics${verifiedLabel}`,
      "ready",
      { provider: lyrics.providerId },
    )

    return successResult(
      "parallel_ranked_verified",
      attempts,
      providersTried,
      lyrics,
      synced,
      alternateOptions,
      {
        matchId: lyrics.id,
        instrumental: best.candidate.instrumental,
        verificationScore: bestVerification?.score,
        contentAssessment,
        transcriptProfile: transcriptProfile ?? undefined,
        english,
        message:
          altCount > 0
            ? `Used ${providerLabel}${verifiedLabel} (${altCount} alternative${altCount === 1 ? "" : "s"} found)`
            : undefined,
      },
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
      contentAssessment,
      transcriptProfile: transcriptProfile ?? undefined,
    }
  }

  const metadataHit = await tryMetadataLyricsFallback(params, attempts, providersTried, (phase) =>
    report(phase, "search"),
  )
  if (metadataHit?.lyrics) {
    const nativeLines = (metadataHit.lyrics.plainLyrics ?? metadataHit.lyrics.syncedLyrics ?? "")
      .replace(/\[[\d:.]+\]/g, "")
      .split("\n")
      .filter(Boolean)
    const english = await resolveEnglishLyrics({
      track: params.track,
      artist: params.artist,
      nativeLines,
      language: detectLanguage(nativeLines.join("\n")),
      durationSec: params.durationSec,
      videoId: params.videoId,
      onProgress: (phase) => report(phase, "search"),
    })
    report(metadataHit.synced ? "Found synced lyrics" : "Found plain lyrics", "ready", {
      provider: metadataHit.providerId,
    })
    return { ...metadataHit, english, contentAssessment, transcriptProfile: transcriptProfile ?? undefined }
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
    contentAssessment,
    transcriptProfile: transcriptProfile ?? undefined,
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
