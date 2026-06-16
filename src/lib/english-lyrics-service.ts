import { isEnglish } from "@/lib/language-service"
import { searchEnglishLyrics } from "@/lib/lyrics-service"
import { lyricstranslateProvider } from "@/lib/lyrics-providers/lyricstranslate-provider"
import { musixmatchProvider } from "@/lib/lyrics-providers/musixmatch-provider"
import { pickBestHit } from "@/lib/lyrics-providers/index"
import {
  translateLinesWithFallback,
  type TranslationBackend,
} from "@/lib/translation-service"
import type { LyricsProviderId } from "@/types/lyrics"

export type EnglishLyricsStatus = "ready" | "loading" | "failed" | "skipped"

export type EnglishLyricsResult = {
  lines: string[]
  source: "found" | "translated"
  providerId?: LyricsProviderId
  translationBackend?: TranslationBackend
  status: EnglishLyricsStatus
}

export type ResolveEnglishLyricsParams = {
  track: string
  artist: string
  nativeLines: string[]
  language: string
  durationSec: number
  videoId?: string
  skipCache?: boolean
  onProgress?: (phase: string) => void
}

async function searchLyricsTranslateEnglish(
  artist: string,
  track: string,
  durationSec: number,
): Promise<string[] | null> {
  const candidates = await lyricstranslateProvider.search({
    artist,
    track,
    durationSec,
    title: `${artist} ${track}`,
  })
  const hit = pickBestHit(candidates, { artist, track, durationSec })
  const text = hit?.candidate.plainLyrics?.trim() || hit?.candidate.syncedLyrics?.trim()
  if (!text) return null
  return text.split("\n").filter(Boolean)
}

async function searchMusixmatchEnglish(
  artist: string,
  track: string,
  durationSec: number,
): Promise<string[] | null> {
  const candidates = await musixmatchProvider.search({
    artist,
    track: `${track} english`,
    durationSec,
    title: `${artist} ${track}`,
  })
  const hit = pickBestHit(candidates, { artist, track, durationSec })
  const text = hit?.candidate.plainLyrics?.trim()
  if (!text) return null
  return text.split("\n").filter(Boolean)
}

export async function resolveEnglishLyrics(
  params: ResolveEnglishLyricsParams,
): Promise<EnglishLyricsResult> {
  const { track, artist, nativeLines, language, durationSec, videoId, skipCache, onProgress } =
    params

  if (isEnglish(language)) {
    return { lines: nativeLines, source: "found", status: "skipped" }
  }

  if (!nativeLines.some((l) => l.trim())) {
    return { lines: [], source: "translated", status: "failed" }
  }

  onProgress?.("Fetching English lyrics…")

  const lrclib = await searchEnglishLyrics(track, artist, durationSec)
  if (lrclib?.plainLyrics?.trim()) {
    return {
      lines: lrclib.plainLyrics.split("\n").filter(Boolean),
      source: "found",
      providerId: "lrclib",
      status: "ready",
    }
  }

  onProgress?.("Searching LyricsTranslate…")
  const ltLines = await searchLyricsTranslateEnglish(artist, track, durationSec)
  if (ltLines && ltLines.length > 0) {
    return {
      lines: ltLines,
      source: "found",
      providerId: "lyricstranslate",
      status: "ready",
    }
  }

  onProgress?.("Searching Musixmatch…")
  const mmLines = await searchMusixmatchEnglish(artist, track, durationSec)
  if (mmLines && mmLines.length > 0) {
    return {
      lines: mmLines,
      source: "found",
      providerId: "musixmatch",
      status: "ready",
    }
  }

  onProgress?.("Translating…")
  const translated = await translateLinesWithFallback(nativeLines, {
    sourceLang: language,
    videoId,
    skipCache,
    mandatory: true,
  })

  if (translated) {
    return {
      lines: translated.lines,
      source: "translated",
      translationBackend: translated.backend,
      status: "ready",
    }
  }

  return { lines: [], source: "translated", status: "failed" }
}
