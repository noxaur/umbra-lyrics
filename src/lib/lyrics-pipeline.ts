import { isAbortError } from "@/lib/abort-signal"
import {
  prefetchEnglishCandidates,
  resolveEnglishFromPrefetch,
  type EnglishLyricsResult,
} from "@/lib/english-lyrics-service"
import {
  detectLanguage,
  inferPreferredLanguage,
  isEnglish,
  looksLikeEnglishLyrics,
  needsEnglishLyrics,
} from "@/lib/language-service"
import {
  orchestrateLyricsSearch,
  type LyricsOrchestratorResult,
  type OrchestratorParams,
  type OrchestratorProgress,
} from "@/lib/lyrics-orchestrator"
import { lrcToPlain } from "@/lib/lyrics-providers/normalize"
import { buildRomajiLines, type RomajiLyricsResult } from "@/lib/romaji-service"
import {
  resolveLyricsWithRust,
  RUST_LYRICS_PROTOCOL_VERSION,
  type RustLyricsEvent,
} from "@/lib/rust-lyrics-resolver"
import type { LyricsResult } from "@/types/lyrics"

export type LyricsPipelineTimings = {
  nativeMs: number
  romajiMs: number
  englishMs: number
  parallelMs: number
}

export type LyricsPipelineParams = OrchestratorParams & {
  onNativeReady?: (result: LyricsOrchestratorResult) => void
  onEnglishProgress?: (phase: string) => void
  useExperimentalRustResolver?: boolean
  fallbackToBrowserOnRustFailure?: boolean
  resolutionSignal?: AbortSignal
  onResolutionEvent?: (event: RustLyricsEvent) => void
}

export type LyricsPipelineResult = {
  native: LyricsOrchestratorResult
  romaji: RomajiLyricsResult
  english: EnglishLyricsResult
  timings: LyricsPipelineTimings
}

export function lyricsResultToNativeLines(lyrics: LyricsResult): string[] {
  const raw = lyrics.plainLyrics?.trim() || lyrics.syncedLyrics?.trim() || ""
  const plain = lyrics.plainLyrics?.trim() ? raw : lrcToPlain(raw)
  return plain.split("\n").filter((line) => line.trim())
}

export function lyricsResultSampleText(lyrics: LyricsResult): string {
  return lyrics.plainLyrics?.trim() || lyrics.syncedLyrics?.trim() || ""
}

/**
 * Dual-track pipeline: native lyrics surface as soon as the orchestrator returns.
 * English lookup is speculative only when metadata predicts non-English lyrics;
 * otherwise native text decides whether English can be skipped.
 */
export async function runLyricsPipeline(
  params: LyricsPipelineParams,
): Promise<LyricsPipelineResult> {
  const wallT0 = performance.now()

  if (params.useExperimentalRustResolver && params.videoId) {
    try {
      const result = await resolveLyricsWithRust(
        {
          videoId: params.videoId,
          title: params.title,
          author: params.oembedAuthor || params.artist,
          duration: params.durationSec,
          language: params.preferredLanguage,
          forceRefresh: params.skipCache,
        },
        {
          signal: params.resolutionSignal,
          onEvent: (event) => {
            params.onResolutionEvent?.(event)
            if (event.event !== "phase" && event.event !== "warning" && event.event !== "result") {
              return
            }
            const message =
              typeof event.data.message === "string" ? event.data.message : "Resolving lyrics…"
            const phase = event.event === "result" ? "ready" : event.data.phase
            params.onProgress?.({
              phase: message,
              step: phase === "accepted" ? "parse" : phase === "ready" ? "ready" : "search",
              providersTotal: 0,
              providersTried: [],
            })
          },
        },
      )
      const nativeStatus =
        result.outcome === "low_confidence" ? "partial" : (result.outcome as "found" | "instrumental" | "not_found")
      const lyrics = result.lyrics
        ? {
            id: result.lyrics.id ?? result.videoId,
            providerId: (result.lyrics.providerId ?? "lrclib") as LyricsResult["providerId"],
            plainLyrics: result.lyrics.plainLyrics,
            syncedLyrics: result.lyrics.syncedLyrics,
          }
        : undefined
      const native: LyricsOrchestratorResult = {
        status: nativeStatus,
        strategy: `rust-sse-v${RUST_LYRICS_PROTOCOL_VERSION}`,
        attempts: [],
        providersTried: [],
        message: result.message,
        lyrics,
        alternates: result.alternates.map((alternate) => ({
          providerId: alternate.providerId as LyricsResult["providerId"],
          id: alternate.id,
          trackName: alternate.trackName,
          artistName: alternate.artistName,
          synced: alternate.synced,
          lineCount: alternate.lineCount,
          rankScore: alternate.rankScore,
          lyricsResult: {
            id: alternate.lyricsResult.id,
            providerId: alternate.lyricsResult.providerId as LyricsResult["providerId"],
            plainLyrics: alternate.lyricsResult.plainLyrics,
            syncedLyrics: alternate.lyricsResult.syncedLyrics,
          },
        })),
        providerId: lyrics?.providerId,
        matchId: lyrics?.id,
        synced: Boolean(lyrics?.syncedLyrics?.trim()),
        instrumental: result.outcome === "instrumental",
      }
      const english =
        result.english?.status === "ready"
          ? {
              lines: result.english.lines ?? [],
              source: result.english.source ?? (result.english.providerId ? "found" : "translated"),
              translationBackend: result.english.translationBackend ?? undefined,
              status: "ready" as const,
            }
          : result.english?.status === "skipped"
            ? {
                lines: [],
                source: "found" as const,
                status: "skipped" as const,
              }
            : {
                lines: [],
                source: "translated" as const,
                status: "failed" as const,
              }
      const romaji =
        result.romaji?.status === "ready"
          ? {
              lines: result.romaji.lines ?? [],
              status: "ready" as const,
            }
          : {
              lines: [],
              status: "skipped" as const,
            }
      params.onNativeReady?.(native)
      return {
        native,
        romaji,
        english,
        timings: {
          nativeMs: Math.round(performance.now() - wallT0),
          romajiMs: 0,
          englishMs: 0,
          parallelMs: Math.round(performance.now() - wallT0),
        },
      }
    } catch (error) {
      if (isAbortError(error)) throw error
      if (!params.fallbackToBrowserOnRustFailure) throw error
    }
  }

  const languageMeta = {
    title: params.title,
    artist: params.artist,
    track: params.track,
    oembedAuthor: params.oembedAuthor,
    preferredLanguage:
      params.preferredLanguage ??
      inferPreferredLanguage({
        title: params.title,
        artist: params.artist,
        track: params.track,
        oembedAuthor: params.oembedAuthor,
      }),
  }
  const metadataPredictsNonEnglish = Boolean(
    languageMeta.preferredLanguage && !isEnglish(languageMeta.preferredLanguage),
  )
  const speculativeEnglishPrefetch = metadataPredictsNonEnglish
    ? prefetchEnglishCandidates(params.track, params.artist, params.durationSec)
    : null

  const nativeT0 = performance.now()
  const native = await orchestrateLyricsSearch({
    ...params,
    onProgress: (update: OrchestratorProgress) => params.onProgress?.(update),
  })
  const nativeMs = Math.round(performance.now() - nativeT0)

  params.onNativeReady?.(native)

  let english: EnglishLyricsResult = {
    lines: [],
    source: "translated",
    status: "failed",
  }
  let romaji: RomajiLyricsResult = {
    lines: [],
    status: "skipped",
  }
  let romajiMs = 0
  let englishMs = 0

  if (native.lyrics && (native.status === "found" || native.status === "instrumental")) {
    const nativeLines = lyricsResultToNativeLines(native.lyrics)
    const sample = lyricsResultSampleText(native.lyrics)
    const language = detectLanguage(sample, languageMeta)
    const romajiT0 = performance.now()
    romaji = await buildRomajiLines(nativeLines, { language })
    romajiMs = Math.round(performance.now() - romajiT0)

    if (
      !metadataPredictsNonEnglish &&
      (!needsEnglishLyrics(sample, languageMeta) ||
        isEnglish(language) ||
        looksLikeEnglishLyrics(sample))
    ) {
      return {
        native,
        romaji,
        english: {
          lines: [],
          source: "found",
          status: "skipped",
        },
        timings: {
          nativeMs,
          romajiMs,
          englishMs: 0,
          parallelMs: Math.round(performance.now() - wallT0),
        },
      }
    }

    const prefetchPromise =
      speculativeEnglishPrefetch ??
      prefetchEnglishCandidates(params.track, params.artist, params.durationSec)
    const englishT0 = performance.now()
    english = await resolveEnglishFromPrefetch(prefetchPromise, {
      track: params.track,
      artist: params.artist,
      nativeLines,
      language,
      durationSec: params.durationSec,
      videoId: params.videoId,
      skipCache: params.skipCache,
      metadata: languageMeta,
      onProgress: params.onEnglishProgress,
    })
    englishMs = Math.round(performance.now() - englishT0)
  }

  return {
    native,
    romaji,
    english,
    timings: {
      nativeMs,
      romajiMs,
      englishMs,
      parallelMs: Math.round(performance.now() - wallT0),
    },
  }
}
