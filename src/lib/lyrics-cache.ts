import type { LyricLine, LyricsAlternate, LyricsProviderId, LyricsResult } from "@/types/lyrics"
import type { TranslationBackend } from "@/lib/translation-service"
import type { EnglishSource } from "@/stores/player-store"

const STORAGE_PREFIX = "song-kara-lyrics:"
const CACHE_VERSION = 4

export type LyricsCacheEntry = {
  v: number
  videoId: string
  lyricsResult: LyricsResult
  providerId: LyricsProviderId
  lines: LyricLine[]
  synced: boolean
  autoTimed?: boolean
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
    (entry.v === CACHE_VERSION || entry.v === 2 || entry.v === 3) &&
    typeof entry.videoId === "string" &&
    Array.isArray(entry.lines) &&
    typeof entry.synced === "boolean" &&
    entry.lyricsResult != null &&
    (typeof entry.lyricsResult.id === "number" || typeof entry.lyricsResult.id === "string") &&
    typeof entry.lyricsResult.providerId === "string"
  )
}

export function getLyricsCache(videoId: string): LyricsCacheEntry | null {
  if (!videoId) return null
  try {
    const raw = localStorage.getItem(storageKey(videoId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidEntry(parsed) || parsed.videoId !== videoId) return null
    if (parsed.lines.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export function setLyricsCache(
  entry: Omit<LyricsCacheEntry, "v" | "cachedAt" | "providerId"> & {
    providerId?: LyricsProviderId
  },
): void {
  if (!entry.videoId || entry.lines.length === 0) return
  const payload: LyricsCacheEntry = {
    ...entry,
    providerId: entry.providerId ?? entry.lyricsResult.providerId,
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
