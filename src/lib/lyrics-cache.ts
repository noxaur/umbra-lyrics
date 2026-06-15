import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import type { LyricLine, LyricsAlternate, LyricsProviderId, LyricsResult } from "@/types/lyrics"
import type { TranslationBackend } from "@/lib/translation-service"
import type { EnglishSource } from "@/stores/player-store"
import { lyricsLanguageMatchesMetadata } from "@/lib/language-service"
import { lyricsTextLooksLikeJunk } from "@/lib/sanitize-lyrics"

const STORAGE_PREFIX = "song-kara-lyrics:"
const CACHE_VERSION = 6

export type LyricsCacheEntry = {
  v: number
  videoId: string
  lyricsResult: LyricsResult
  providerId: LyricsProviderId
  lines: LyricLine[]
  synced: boolean
  autoTimed?: boolean
  parsedDurationMs?: number
  englishLines: string[]
  englishSource?: EnglishSource
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
      entry.v === 5) &&
    typeof entry.videoId === "string" &&
    Array.isArray(entry.lines) &&
    typeof entry.synced === "boolean" &&
    entry.lyricsResult != null &&
    (typeof entry.lyricsResult.id === "number" || typeof entry.lyricsResult.id === "string") &&
    typeof entry.lyricsResult.providerId === "string"
  )
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
    if (parsed.v !== CACHE_VERSION || !isTrustedCacheEntry(parsed)) {
      localStorage.removeItem(storageKey(videoId))
      return null
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
