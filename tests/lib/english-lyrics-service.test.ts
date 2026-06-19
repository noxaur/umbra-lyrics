import { describe, expect, it, vi, beforeEach } from "vitest"
import { resolveEnglishLyrics } from "@/lib/english-lyrics-service"

vi.mock("@/lib/lyrics-service", () => ({
  searchEnglishLyrics: vi.fn(),
}))

vi.mock("@/lib/lyrics-providers/lyricstranslate-provider", () => ({
  lyricstranslateProvider: { search: vi.fn().mockResolvedValue([]) },
}))

vi.mock("@/lib/lyrics-providers/musixmatch-provider", () => ({
  musixmatchProvider: { search: vi.fn().mockResolvedValue([]) },
}))

vi.mock("@/lib/translation-service", () => ({
  translateLinesWithFallback: vi.fn(),
}))

import { searchEnglishLyrics } from "@/lib/lyrics-service"
import { translateLinesWithFallback } from "@/lib/translation-service"

const mockSearch = vi.mocked(searchEnglishLyrics)
const mockTranslate = vi.mocked(translateLinesWithFallback)

const jpMeta = {
  title: "【Original Anime MV】別世界 - 天音かなた【ホロライブ】",
  artist: "天音かなた",
  track: "別世界",
  preferredLanguage: "ja",
}

describe("resolveEnglishLyrics", () => {
  beforeEach(() => {
    mockSearch.mockReset()
    mockTranslate.mockReset()
  })

  it("skips for English-native songs", async () => {
    const result = await resolveEnglishLyrics({
      track: "Hello",
      artist: "Adele",
      nativeLines: ["Hello from the other side"],
      language: "en",
      durationSec: 200,
    })

    expect(result.status).toBe("skipped")
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("returns LRCLIB English when found", async () => {
    mockSearch.mockResolvedValue({
      id: 1,
      providerId: "lrclib",
      plainLyrics: "Line one\nLine two",
      syncedLyrics: null,
    })

    const result = await resolveEnglishLyrics({
      track: "別世界",
      artist: "天音かなた",
      nativeLines: ["別の世界へ", "遠い空"],
      language: "ja",
      durationSec: 200,
      metadata: jpMeta,
    })

    expect(result.status).toBe("ready")
    expect(result.source).toBe("found")
    expect(result.lines).toEqual(["Line one", "Line two"])
  })

  it("rejects LRCLIB hits that duplicate native lyrics", async () => {
    mockSearch.mockResolvedValue({
      id: 1,
      providerId: "lrclib",
      plainLyrics: "別の世界へ",
      syncedLyrics: null,
    })
    mockTranslate.mockResolvedValue({
      lines: ["Other world"],
      backend: "google",
      fromCache: false,
    })

    const result = await resolveEnglishLyrics({
      track: "別世界",
      artist: "天音かなた",
      nativeLines: ["別の世界へ"],
      language: "ja",
      durationSec: 200,
      metadata: jpMeta,
    })

    expect(result.status).toBe("ready")
    expect(result.source).toBe("translated")
    expect(mockTranslate).toHaveBeenCalled()
  })

  it("still fetches English when franc mislabels romaji as English", async () => {
    mockSearch.mockResolvedValue(null)
    mockTranslate.mockResolvedValue({
      lines: ["To another world"],
      backend: "google",
      fromCache: false,
    })

    const result = await resolveEnglishLyrics({
      track: "別世界",
      artist: "天音かなた",
      nativeLines: ["betsu no sekai e"],
      language: "en",
      durationSec: 200,
      metadata: jpMeta,
    })

    expect(result.status).toBe("ready")
    expect(result.source).toBe("translated")
    expect(mockTranslate).toHaveBeenCalledWith(
      ["betsu no sekai e"],
      expect.objectContaining({ sourceLang: "ja", mandatory: true }),
    )
  })

  it("falls back to machine translation", async () => {
    mockSearch.mockResolvedValue(null)
    mockTranslate.mockResolvedValue({
      lines: ["Other world"],
      backend: "google",
      fromCache: false,
    })

    const result = await resolveEnglishLyrics({
      track: "別世界",
      artist: "天音かなた",
      nativeLines: ["別の世界へ"],
      language: "ja",
      durationSec: 200,
      metadata: jpMeta,
    })

    expect(result.status).toBe("ready")
    expect(result.source).toBe("translated")
    expect(result.translationBackend).toBe("google")
  })

  it("aligns English lines to native row count", async () => {
    mockSearch.mockResolvedValue({
      id: 1,
      providerId: "lrclib",
      plainLyrics: "Line one\nLine two",
      syncedLyrics: null,
    })

    const result = await resolveEnglishLyrics({
      track: "別世界",
      artist: "天音かなた",
      nativeLines: ["別の世界へ", "", "遠い空"],
      language: "ja",
      durationSec: 200,
      metadata: jpMeta,
    })

    expect(result.lines).toHaveLength(3)
    expect(result.lines[1]).toBe("")
  })

  it("prefetches raw English candidates from providers", async () => {
    mockSearch.mockResolvedValue({
      id: 1,
      providerId: "lrclib",
      plainLyrics: "Line one\nLine two",
      syncedLyrics: null,
    })

    const { prefetchEnglishCandidates } = await import("@/lib/english-lyrics-service")
    const candidates = await prefetchEnglishCandidates("別世界", "天音かなた", 200)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].providerId).toBe("lrclib")
  })

  it("searches English providers in parallel", async () => {
    const { lyricstranslateProvider } = await import("@/lib/lyrics-providers/lyricstranslate-provider")
    const { musixmatchProvider } = await import("@/lib/lyrics-providers/musixmatch-provider")
    const ltSearch = vi.mocked(lyricstranslateProvider.search)
    const mmSearch = vi.mocked(musixmatchProvider.search)

    let inFlight = 0
    let maxInFlight = 0
    const track = async <T>(fn: () => Promise<T>) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight -= 1
      return fn()
    }

    mockSearch.mockImplementation(() =>
      track(async () => ({
        id: 1,
        providerId: "lrclib" as const,
        plainLyrics: "Line one\nLine two",
        syncedLyrics: null,
      })),
    )
    ltSearch.mockImplementation(() => track(async () => []))
    mmSearch.mockImplementation(() => track(async () => []))

    const result = await resolveEnglishLyrics({
      track: "別世界",
      artist: "天音かなた",
      nativeLines: ["別の世界へ", "遠い空"],
      language: "ja",
      durationSec: 200,
      metadata: jpMeta,
    })

    expect(result.status).toBe("ready")
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it("does not wait indefinitely for a slow English provider", async () => {
    vi.useFakeTimers()
    const { lyricstranslateProvider } = await import("@/lib/lyrics-providers/lyricstranslate-provider")
    const { musixmatchProvider } = await import("@/lib/lyrics-providers/musixmatch-provider")
    vi.mocked(lyricstranslateProvider.search).mockResolvedValue([])
    vi.mocked(musixmatchProvider.search).mockResolvedValue([])
    mockSearch.mockImplementation(() => new Promise(() => {}))

    const { prefetchEnglishCandidates, ENGLISH_CANDIDATE_TIMEOUT_MS } = await import(
      "@/lib/english-lyrics-service"
    )
    const pending = prefetchEnglishCandidates("別世界", "天音かなた", 200)

    await vi.advanceTimersByTimeAsync(ENGLISH_CANDIDATE_TIMEOUT_MS + 1)
    await expect(pending).resolves.toEqual([])

    vi.useRealTimers()
  })
})
