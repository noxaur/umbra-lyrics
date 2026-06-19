import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { detectLanguage, inferPreferredLanguage } from "@/lib/language-service"
import type { EnglishLyricsResult } from "@/lib/english-lyrics-service"
import { getLyricsCache, setLyricsCache } from "@/lib/lyrics-cache"
import type { LyricsPipelineResult } from "@/lib/lyrics-pipeline"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import type { LyricsProviderId } from "@/types/lyrics"

export type CacheLyricsInput = {
  videoId: string
  title: string
  artist: string
  track: string
  durationSec: number
  oembedAuthor?: string
}

export function cacheLyricsFromPipeline(
  input: CacheLyricsInput,
  pipeline: LyricsPipelineResult,
): boolean {
  const native = pipeline.native
  if (native.status !== "found" && native.status !== "instrumental") return false
  if (!native.lyrics) return false

  const lyricsResult = native.lyrics
  const durationMs = Math.max(0, Math.round(input.durationSec * 1000))
  const syncedRaw = lyricsResult.syncedLyrics?.trim()
    ? prepareLyricsText(lyricsResult.syncedLyrics)
    : null
  const plainRaw = lyricsResult.plainLyrics?.trim()
    ? prepareLyricsText(lyricsResult.plainLyrics)
    : null

  let parsed =
    syncedRaw && durationMs > 0
      ? parseLrc(syncedRaw, durationMs)
      : plainRaw
        ? parsePlainLyrics(plainRaw, durationMs || 180_000)
        : { lines: [], synced: false, autoTimed: false }

  if (parsed.lines.length === 0 && plainRaw) {
    parsed = parsePlainLyrics(plainRaw, durationMs || 180_000)
  }
  if (parsed.lines.length === 0) return false

  const sample = plainRaw ?? syncedRaw ?? parsed.lines.map((line) => line.text).join("\n")
  const languageMeta = {
    title: input.title,
    artist: input.artist,
    track: input.track,
    oembedAuthor: input.oembedAuthor,
    preferredLanguage: inferPreferredLanguage({
      title: input.title,
      artist: input.artist,
      track: input.track,
      oembedAuthor: input.oembedAuthor,
    }),
  }
  const languageCode = detectLanguage(sample, languageMeta)
  const english = pipeline.english

  setLyricsCache({
    videoId: input.videoId,
    lyricsResult,
    providerId: (lyricsResult.providerId ?? native.providerId ?? "lrclib") as LyricsProviderId,
    lines: parsed.lines,
    synced: parsed.synced,
    autoTimed: parsed.autoTimed ?? false,
    aligned: parsed.aligned ?? false,
    parsedDurationMs: durationMs || undefined,
    englishLines: english.status === "ready" ? english.lines : [],
    englishSource: english.status === "ready" ? english.source : null,
    translationBackend: english.translationBackend ?? null,
    englishStatus: english.status,
    romajiLines: pipeline.romaji?.status === "ready" ? pipeline.romaji.lines : [],
    romajiStatus: pipeline.romaji?.status ?? null,
    languageCode,
    title: input.title,
    artist: input.artist,
    track: input.track,
    alternates: native.alternates ?? [],
  })

  return true
}

export function mergeEnglishIntoCache(
  videoId: string,
  english: EnglishLyricsResult,
): void {
  const cached = getLyricsCache(videoId)
  if (!cached || english.status !== "ready") return
  setLyricsCache({
    ...cached,
    englishLines: english.lines,
    englishSource: english.source,
    translationBackend: english.translationBackend ?? null,
    englishStatus: english.status,
  })
}
