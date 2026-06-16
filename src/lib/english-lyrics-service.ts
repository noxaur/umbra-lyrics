import { alignEnglishLines } from "@/lib/align-english-lines"
import {
  isEnglish,
  looksLikeEnglishLyrics,
  lyricsOverlapRatio,
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

export type EnglishCandidate = {
  lines: string[]
  providerId: LyricsProviderId
  source: "found"
}

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

const MAX_NATIVE_OVERLAP = 0.45
export const ENGLISH_CANDIDATE_TIMEOUT_MS = 3_500

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs)
    }),
  ])
}

function finalizeEnglishLines(
  nativeLines: string[],
  englishLines: string[],
  result: Omit<EnglishLyricsResult, "lines">,
): EnglishLyricsResult {
  return {
    ...result,
    lines: alignEnglishLines(nativeLines, englishLines),
  }
}

function linesAreUsableEnglish(lines: string[], nativeLines: string[]): boolean {
  if (lines.length === 0) return false
  const text = lines.join("\n").trim()
  if (!looksLikeEnglishLyrics(text)) return false

  const native = nativeLines.join("\n").trim()
  if (!native) return true

  if (lyricsOverlapRatio(native, text) > MAX_NATIVE_OVERLAP) return false

  const nativeNorm = native.toLowerCase()
  const candidateNorm = text.toLowerCase()
  if (nativeNorm && candidateNorm === nativeNorm) return false

  return true
}

async function searchLyricsTranslateRaw(
  artist: string,
  track: string,
  durationSec: number,
): Promise<EnglishCandidate | null> {
  const candidates = await lyricstranslateProvider.search({
    artist,
    track,
    durationSec,
    title: `${artist} ${track}`,
  })
  const hit = pickBestHit(candidates, { artist, track, durationSec })
  const text = hit?.candidate.plainLyrics?.trim() || hit?.candidate.syncedLyrics?.trim()
  if (!text || !looksLikeEnglishLyrics(text)) return null
  return {
    lines: text.split("\n").filter(Boolean),
    providerId: "lyricstranslate",
    source: "found",
  }
}

async function searchMusixmatchRaw(
  artist: string,
  track: string,
  durationSec: number,
): Promise<EnglishCandidate | null> {
  const candidates = await musixmatchProvider.search({
    artist,
    track: `${track} english`,
    durationSec,
    title: `${artist} ${track}`,
  })
  const hit = pickBestHit(candidates, { artist, track, durationSec })
  const text = hit?.candidate.plainLyrics?.trim()
  if (!text || !looksLikeEnglishLyrics(text)) return null
  return {
    lines: text.split("\n").filter(Boolean),
    providerId: "musixmatch",
    source: "found",
  }
}

async function searchLrclibRaw(
  track: string,
  artist: string,
  durationSec: number,
): Promise<EnglishCandidate | null> {
  const lrclib = await searchEnglishLyrics(track, artist, durationSec)
  if (!lrclib?.plainLyrics?.trim()) return null
  const text = lrclib.plainLyrics.trim()
  if (!looksLikeEnglishLyrics(text)) return null
  return {
    lines: text.split("\n").filter(Boolean),
    providerId: "lrclib",
    source: "found",
  }
}

/** Fetch English lyric candidates from all providers without native overlap checks. */
export async function prefetchEnglishCandidates(
  track: string,
  artist: string,
  durationSec: number,
): Promise<EnglishCandidate[]> {
  const settled = await Promise.allSettled([
    withTimeout(searchLrclibRaw(track, artist, durationSec), ENGLISH_CANDIDATE_TIMEOUT_MS),
    withTimeout(searchLyricsTranslateRaw(artist, track, durationSec), ENGLISH_CANDIDATE_TIMEOUT_MS),
    withTimeout(searchMusixmatchRaw(artist, track, durationSec), ENGLISH_CANDIDATE_TIMEOUT_MS),
  ])

  const out: EnglishCandidate[] = []
  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && outcome.value) out.push(outcome.value)
  }
  return out
}

function pickUsableCandidate(
  candidates: EnglishCandidate[],
  nativeLines: string[],
): EnglishCandidate | null {
  const priority: LyricsProviderId[] = ["lrclib", "lyricstranslate", "musixmatch"]
  for (const providerId of priority) {
    const candidate = candidates.find((c) => c.providerId === providerId)
    if (candidate && linesAreUsableEnglish(candidate.lines, nativeLines)) return candidate
  }
  return null
}

export async function resolveEnglishFromPrefetch(
  prefetch: Promise<EnglishCandidate[]>,
  params: ResolveEnglishLyricsParams,
): Promise<EnglishLyricsResult> {
  const {
    track,
    artist,
    nativeLines,
    language,
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

  onProgress?.("Matching English lyrics…")
  const candidates = await prefetch
  const match = pickUsableCandidate(candidates, nativeLines)
  if (match) {
    return finalizeEnglishLines(nativeLines, match.lines, {
      source: "found",
      providerId: match.providerId,
      status: "ready",
    })
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
    return finalizeEnglishLines(nativeLines, translated.lines, {
      source: "translated",
      translationBackend: translated.backend,
      status: "ready",
    })
  }

  return { lines: [], source: "translated", status: "failed" }
}

async function searchLyricsTranslateEnglish(
  artist: string,
  track: string,
  durationSec: number,
  nativeLines: string[],
): Promise<string[] | null> {
  const raw = await searchLyricsTranslateRaw(artist, track, durationSec)
  if (!raw) return null
  return linesAreUsableEnglish(raw.lines, nativeLines) ? raw.lines : null
}

async function searchMusixmatchEnglish(
  artist: string,
  track: string,
  durationSec: number,
  nativeLines: string[],
): Promise<string[] | null> {
  const raw = await searchMusixmatchRaw(artist, track, durationSec)
  if (!raw) return null
  return linesAreUsableEnglish(raw.lines, nativeLines) ? raw.lines : null
}

async function searchLrclibEnglish(
  track: string,
  artist: string,
  durationSec: number,
  nativeLines: string[],
): Promise<string[] | null> {
  const raw = await searchLrclibRaw(track, artist, durationSec)
  if (!raw) return null
  return linesAreUsableEnglish(raw.lines, nativeLines) ? raw.lines : null
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

  onProgress?.("Searching English lyrics…")

  const [lrclibLines, ltLines, mmLines] = await Promise.all([
    searchLrclibEnglish(track, artist, durationSec, nativeLines),
    searchLyricsTranslateEnglish(artist, track, durationSec, nativeLines),
    searchMusixmatchEnglish(artist, track, durationSec, nativeLines),
  ])

  if (lrclibLines && lrclibLines.length > 0) {
    return finalizeEnglishLines(nativeLines, lrclibLines, {
      source: "found",
      providerId: "lrclib",
      status: "ready",
    })
  }

  if (ltLines && ltLines.length > 0) {
    return finalizeEnglishLines(nativeLines, ltLines, {
      source: "found",
      providerId: "lyricstranslate",
      status: "ready",
    })
  }

  if (mmLines && mmLines.length > 0) {
    return finalizeEnglishLines(nativeLines, mmLines, {
      source: "found",
      providerId: "musixmatch",
      status: "ready",
    })
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
    return finalizeEnglishLines(nativeLines, translated.lines, {
      source: "translated",
      translationBackend: translated.backend,
      status: "ready",
    })
  }

  return { lines: [], source: "translated", status: "failed" }
}
