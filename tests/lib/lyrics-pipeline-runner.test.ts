import { describe, expect, it, vi, beforeEach } from "vitest"
import { runLyricsPipeline, lyricsResultToNativeLines } from "@/lib/lyrics-pipeline"

vi.mock("@/lib/lyrics-orchestrator", () => ({
  orchestrateLyricsSearch: vi.fn(),
}))

vi.mock("@/lib/english-lyrics-service", () => ({
  prefetchEnglishCandidates: vi.fn(),
  resolveEnglishFromPrefetch: vi.fn(),
}))

import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"
import { prefetchEnglishCandidates, resolveEnglishFromPrefetch } from "@/lib/english-lyrics-service"

const mockOrchestrate = vi.mocked(orchestrateLyricsSearch)
const mockPrefetch = vi.mocked(prefetchEnglishCandidates)
const mockResolvePrefetch = vi.mocked(resolveEnglishFromPrefetch)

describe("runLyricsPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrefetch.mockResolvedValue([])
    mockResolvePrefetch.mockResolvedValue({
      lines: ["English line"],
      source: "found",
      providerId: "lrclib",
      status: "ready",
    })
  })

  it("starts English prefetch alongside native orchestration when metadata predicts non-English lyrics", async () => {
    let prefetchStarted = false

    mockPrefetch.mockImplementation(async () => {
      prefetchStarted = true
      await new Promise((resolve) => setTimeout(resolve, 30))
      return [{ lines: ["English"], providerId: "lrclib", source: "found" }]
    })

    mockOrchestrate.mockImplementation(async () => {
      expect(prefetchStarted).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 10))
      return {
        status: "found",
        strategy: "test",
        attempts: [],
        providersTried: ["lrclib"],
        message: "ok",
        synced: true,
        lyrics: {
          id: 1,
          providerId: "lrclib",
          plainLyrics: "別の世界へ",
          syncedLyrics: null,
        },
      }
    })

    const onNativeReady = vi.fn()
    const result = await runLyricsPipeline({
      track: "別世界",
      artist: "天音かなた",
      title: "別世界 - 天音かなた",
      durationSec: 246,
      onNativeReady,
    })

    expect(onNativeReady).toHaveBeenCalledOnce()
    expect(mockPrefetch).toHaveBeenCalled()
    expect(mockResolvePrefetch).toHaveBeenCalled()
    expect(result.romaji.status).toBe("ready")
    expect(result.romaji.lines).toEqual(["別 no 世界 e"])
    expect(result.english.status).toBe("ready")
    expect(result.timings.parallelMs).toBeGreaterThan(0)
  })

  it("skips English prefetch when native lyrics are already English", async () => {
    mockOrchestrate.mockResolvedValue({
      status: "found",
      strategy: "test",
      attempts: [],
      providersTried: ["lrclib"],
      message: "ok",
      synced: true,
      lyrics: {
        id: 1,
        providerId: "lrclib",
        plainLyrics: "Never gonna give you up\nNever gonna let you down",
        syncedLyrics: null,
      },
    })

    const result = await runLyricsPipeline({
      track: "Never Gonna Give You Up",
      artist: "Rick Astley",
      title: "Rick Astley - Never Gonna Give You Up",
      durationSec: 214,
    })

    expect(mockPrefetch).not.toHaveBeenCalled()
    expect(mockResolvePrefetch).not.toHaveBeenCalled()
    expect(result.romaji.status).toBe("skipped")
    expect(result.romaji.lines).toEqual([])
    expect(result.english.status).toBe("skipped")
    expect(result.english.lines).toEqual([
      "Never gonna give you up",
      "Never gonna let you down",
    ])
  })

  it("extracts native lines from plain lyrics", () => {
    const lines = lyricsResultToNativeLines({
      id: 1,
      providerId: "lrclib",
      plainLyrics: "Hello\nWorld",
      syncedLyrics: null,
    })
    expect(lines).toEqual(["Hello", "World"])
  })

  it("strips LRC timestamps from synced lyrics", () => {
    const lines = lyricsResultToNativeLines({
      id: 1,
      providerId: "lrclib",
      plainLyrics: null,
      syncedLyrics: "[00:00.00] Hello\n[00:05.00] World",
    })
    expect(lines).toEqual(["Hello", "World"])
  })
})
