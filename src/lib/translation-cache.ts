import type { TranslationBackend } from "@/lib/translation-service"

const STORAGE_PREFIX = "umbra-translate:"
const CACHE_VERSION = 1
const MIN_REQUEST_GAP_MS = 2000

export type TranslationCacheEntry = {
  v: number
  videoId: string
  sourceLang: string
  targetLang: string
  lines: string[]
  backend: TranslationBackend
  cachedAt: number
}

const lastRequestAt = new Map<string, number>()

function storageKey(videoId: string, sourceLang: string, targetLang: string): string {
  return `${STORAGE_PREFIX}${videoId}:${sourceLang}:${targetLang}`
}

function isValidEntry(value: unknown): value is TranslationCacheEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as TranslationCacheEntry
  return (
    entry.v === CACHE_VERSION &&
    typeof entry.videoId === "string" &&
    typeof entry.sourceLang === "string" &&
    Array.isArray(entry.lines) &&
    entry.lines.length > 0 &&
    typeof entry.backend === "string"
  )
}

export function getTranslationCache(
  videoId: string,
  sourceLang: string,
  targetLang = "en",
): TranslationCacheEntry | null {
  if (!videoId) return null
  try {
    const raw = localStorage.getItem(storageKey(videoId, sourceLang, targetLang))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidEntry(parsed) || parsed.videoId !== videoId) return null
    return parsed
  } catch {
    return null
  }
}

export function setTranslationCache(
  entry: Omit<TranslationCacheEntry, "v" | "cachedAt">,
): void {
  if (!entry.videoId || entry.lines.length === 0) return
  const payload: TranslationCacheEntry = {
    ...entry,
    v: CACHE_VERSION,
    cachedAt: Date.now(),
  }
  try {
    localStorage.setItem(
      storageKey(entry.videoId, entry.sourceLang, entry.targetLang),
      JSON.stringify(payload),
    )
  } catch {
    // quota / private mode
  }
}

export function canRequestTranslation(videoId: string): boolean {
  const key = videoId || "__global__"
  const last = lastRequestAt.get(key) ?? 0
  return Date.now() - last >= MIN_REQUEST_GAP_MS
}

export function markTranslationRequested(videoId: string): void {
  lastRequestAt.set(videoId || "__global__", Date.now())
}

/** Reset in-memory rate limiter between tests. */
export function resetTranslationRateLimitForTests(): void {
  lastRequestAt.clear()
}
