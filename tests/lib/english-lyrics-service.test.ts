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
})
