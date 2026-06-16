import {
  prefetchEnglishCandidates,
  resolveEnglishFromPrefetch,
  type EnglishLyricsResult,
} from "@/lib/english-lyrics-service"
import { detectLanguage, inferPreferredLanguage } from "@/lib/language-service"
import {
  orchestrateLyricsSearch,
  type LyricsOrchestratorResult,
  type OrchestratorParams,
  type OrchestratorProgress,
} from "@/lib/lyrics-orchestrator"
import { lrcToPlain } from "@/lib/lyrics-providers/normalize"
import type { LyricsResult } from "@/types/lyrics"

export type LyricsPipelineTimings = {
  nativeMs: number
  englishMs: number
  parallelMs: number
}

export type LyricsPipelineParams = OrchestratorParams & {
  onNativeReady?: (result: LyricsOrchestratorResult) => void
  onEnglishProgress?: (phase: string) => void
}

export type LyricsPipelineResult = {
  native: LyricsOrchestratorResult
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
 * Dual-track pipeline: English provider searches start immediately alongside native
 * orchestration. Native lyrics surface as soon as the orchestrator returns; English
 * is validated against prefetched candidates (or translated) before the pipeline resolves.
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

  const prefetchPromise = prefetchEnglishCandidates(
    params.track,
    params.artist,
    params.durationSec,
  )

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
  let englishMs = 0

  if (native.lyrics && (native.status === "found" || native.status === "instrumental")) {
    const nativeLines = lyricsResultToNativeLines(native.lyrics)
    const sample = lyricsResultSampleText(native.lyrics)
    const englishT0 = performance.now()
    english = await resolveEnglishFromPrefetch(prefetchPromise, {
      track: params.track,
      artist: params.artist,
      nativeLines,
      language: detectLanguage(sample, languageMeta),
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
    english,
    timings: {
      nativeMs,
      englishMs,
      parallelMs: Math.round(performance.now() - wallT0),
    },
  }
}
