import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import type { LyricLine, LyricsAlternate, LyricsProviderId, LyricsResult } from "@/types/lyrics"
import type { TranslationBackend } from "@/lib/translation-service"
import type { EnglishSource, RomajiLyricsStatus } from "@/stores/player-store"
import { lyricsLanguageMatchesMetadata } from "@/lib/language-service"
import { buildRomajiLines } from "@/lib/romaji-service"
import { lyricsTextLooksLikeJunk } from "@/lib/sanitize-lyrics"

const STORAGE_PREFIX = "song-kara-lyrics:"
const CACHE_VERSION = 10
const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fff]/

export type LyricsCacheEntry = {
  v: number
  videoId: string
  lyricsResult: LyricsResult
  providerId: LyricsProviderId
  lines: LyricLine[]
  synced: boolean
  autoTimed?: boolean
  aligned?: boolean
  parsedDurationMs?: number
  englishLines: string[]
  romajiLines?: string[]
  romajiStatus?: RomajiLyricsStatus
  englishSource?: EnglishSource
  englishStatus?: "ready" | "loading" | "failed" | "skipped" | null
  translationBackend?: TranslationBackend | null
  languageCode: string
  title: string
  artist: string
  track: string
  alternates?: LyricsAlternate[]
  cachedAt: number
}

function storageKey(videoId: string): string {
  return `${STORAGE_PREFIX}${videoId}`
}

function isValidEntry(value: unknown): value is LyricsCacheEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as LyricsCacheEntry
  return (
    (entry.v === CACHE_VERSION ||
      entry.v === 2 ||
      entry.v === 3 ||
      entry.v === 4 ||
      entry.v === 5 ||
      entry.v === 6 ||
      entry.v === 8) &&
    typeof entry.videoId === "string" &&
    Array.isArray(entry.lines) &&
    typeof entry.synced === "boolean" &&
    entry.lyricsResult != null &&
    (typeof entry.lyricsResult.id === "number" || typeof entry.lyricsResult.id === "string") &&
    typeof entry.lyricsResult.providerId === "string"
  )
}

function needsRomajiRebuild(entry: LyricsCacheEntry): boolean {
  const nativeText = entry.lines.map((line) => line.text).join("\n")
  if (!CJK_RE.test(nativeText)) return false
  if (entry.romajiStatus !== "ready" || !entry.romajiLines?.length) return true
  return entry.romajiLines.some((line) => CJK_RE.test(line))
}

function isTrustedCacheEntry(entry: LyricsCacheEntry): boolean {
  const text = entry.lines.map((line) => line.text).join("\n")
  if (lyricsTextLooksLikeJunk(text)) return false
  return lyricsLanguageMatchesMetadata(text, {
    title: entry.title,
    artist: entry.artist,
    track: entry.track,
  })
}

export function reparseCachedLyrics(
  entry: LyricsCacheEntry,
  durationMs: number,
): { lines: LyricLine[]; synced: boolean; autoTimed: boolean; suggestedOffsetMs?: number } | null {
  if (durationMs <= 0) return null

  const syncedRaw = entry.lyricsResult.syncedLyrics?.trim()
    ? prepareLyricsText(entry.lyricsResult.syncedLyrics)
    : null
  const plainRaw = entry.lyricsResult.plainLyrics?.trim()
    ? prepareLyricsText(entry.lyricsResult.plainLyrics)
    : null

  if (syncedRaw) {
    const parsed = parseLrc(syncedRaw, durationMs)
    if (parsed.lines.length === 0) return null
    return {
      lines: parsed.lines,
      synced: true,
      autoTimed: false,
      suggestedOffsetMs: parsed.suggestedOffsetMs,
    }
  }

  if (plainRaw) {
    const parsed = parsePlainLyrics(plainRaw, durationMs)
    if (parsed.lines.length === 0) return null
    return {
      lines: parsed.lines,
      synced: false,
      autoTimed: parsed.autoTimed ?? true,
    }
  }

  return null
}

export function getLyricsCache(videoId: string): LyricsCacheEntry | null {
  if (!videoId) return null
  try {
    const raw = localStorage.getItem(storageKey(videoId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidEntry(parsed) || parsed.videoId !== videoId) return null
    if (parsed.lines.length === 0) return null
    if (!isTrustedCacheEntry(parsed)) {
      localStorage.removeItem(storageKey(videoId))
      return null
    }
    if (needsRomajiRebuild(parsed)) {
      const romaji = buildRomajiLines(
        parsed.lines.map((line) => line.text),
        { language: parsed.languageCode },
      )
      if (romaji.status === "ready") {
        parsed.romajiLines = romaji.lines
        parsed.romajiStatus = romaji.status
        localStorage.setItem(storageKey(videoId), JSON.stringify(parsed))
      }
    }
    return parsed
  } catch {
    return null
  }
}

export function setLyricsCache(
  entry: Omit<LyricsCacheEntry, "v" | "cachedAt" | "providerId"> & {
    providerId?: LyricsProviderId
    parsedDurationMs?: number
  },
): void {
  if (!entry.videoId || entry.lines.length === 0) return
  const payload: LyricsCacheEntry = {
    ...entry,
    romajiLines: entry.romajiLines ?? [],
    romajiStatus: entry.romajiStatus ?? null,
    providerId: entry.providerId ?? entry.lyricsResult.providerId,
    parsedDurationMs: entry.parsedDurationMs,
    v: CACHE_VERSION,
    cachedAt: Date.now(),
  }
  try {
    localStorage.setItem(storageKey(entry.videoId), JSON.stringify(payload))
  } catch {
    // Quota exceeded or private mode — ignore
  }
}

export function clearLyricsCache(videoId?: string): void {
  if (videoId) {
    localStorage.removeItem(storageKey(videoId))
    return
  }
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key)
  }
}
