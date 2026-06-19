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
    romaji = buildRomajiLines(nativeLines, { language })
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
