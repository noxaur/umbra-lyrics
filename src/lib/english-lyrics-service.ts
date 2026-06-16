import {
  isEnglish,
  looksLikeEnglishLyrics,
  needsEnglishLyrics,
  resolveTranslationSourceLang,
  type LyricsLanguageMeta,
} from "@/lib/language-service"
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
  metadata?: LyricsLanguageMeta
  onProgress?: (phase: string) => void
}

function linesAreUsableEnglish(lines: string[], nativeLines: string[]): boolean {
  if (lines.length === 0) return false
  const text = lines.join("\n").trim()
  if (!looksLikeEnglishLyrics(text)) return false

  const native = nativeLines.join("\n").trim().toLowerCase()
  const candidate = text.toLowerCase()
  if (native && candidate === native) return false

  return true
}

async function searchLyricsTranslateEnglish(
  artist: string,
  track: string,
  durationSec: number,
  nativeLines: string[],
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
  const lines = text.split("\n").filter(Boolean)
  return linesAreUsableEnglish(lines, nativeLines) ? lines : null
}

async function searchMusixmatchEnglish(
  artist: string,
  track: string,
  durationSec: number,
  nativeLines: string[],
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
  const lines = text.split("\n").filter(Boolean)
  return linesAreUsableEnglish(lines, nativeLines) ? lines : null
}

export async function resolveEnglishLyrics(
  params: ResolveEnglishLyricsParams,
): Promise<EnglishLyricsResult> {
  const {
    track,
    artist,
    nativeLines,
    language,
    durationSec,
    videoId,
    skipCache,
    metadata,
    onProgress,
  } = params

  const nativeText = nativeLines.join("\n")
  const languageMeta: LyricsLanguageMeta = {
    ...metadata,
    artist: metadata?.artist ?? artist,
    track: metadata?.track ?? track,
  }

  if (!needsEnglishLyrics(nativeText, languageMeta) && isEnglish(language)) {
    return { lines: nativeLines, source: "found", status: "skipped" }
  }

  if (!nativeLines.some((l) => l.trim())) {
    return { lines: [], source: "translated", status: "failed" }
  }

  onProgress?.("Fetching English lyrics…")

  const lrclib = await searchEnglishLyrics(track, artist, durationSec)
  if (lrclib?.plainLyrics?.trim()) {
    const lines = lrclib.plainLyrics.split("\n").filter(Boolean)
    if (linesAreUsableEnglish(lines, nativeLines)) {
      return {
        lines,
        source: "found",
        providerId: "lrclib",
        status: "ready",
      }
    }
  }

  onProgress?.("Searching LyricsTranslate…")
  const ltLines = await searchLyricsTranslateEnglish(artist, track, durationSec, nativeLines)
  if (ltLines && ltLines.length > 0) {
    return {
      lines: ltLines,
      source: "found",
      providerId: "lyricstranslate",
      status: "ready",
    }
  }

  onProgress?.("Searching Musixmatch…")
  const mmLines = await searchMusixmatchEnglish(artist, track, durationSec, nativeLines)
  if (mmLines && mmLines.length > 0) {
    return {
      lines: mmLines,
      source: "found",
      providerId: "musixmatch",
      status: "ready",
    }
  }

  onProgress?.("Translating…")
  const sourceLang = resolveTranslationSourceLang(nativeText, languageMeta)
  const translated = await translateLinesWithFallback(nativeLines, {
    sourceLang,
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
