import { describe, expect, it, vi, beforeEach } from "vitest"
import { runLyricsPipeline, lyricsResultToNativeLines } from "@/lib/lyrics-pipeline"

vi.mock("@/lib/lyrics-orchestrator", () => ({
  orchestrateLyricsSearch: vi.fn(),
}))

vi.mock("@/lib/english-lyrics-service", () => ({
  prefetchEnglishCandidates: vi.fn(),
  resolveEnglishFromPrefetch: vi.fn(),
}))

vi.mock("@/lib/rust-lyrics-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rust-lyrics-resolver")>()
  return {
    ...actual,
    resolveLyricsWithRust: vi.fn(),
  }
})

import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"
import { prefetchEnglishCandidates, resolveEnglishFromPrefetch } from "@/lib/english-lyrics-service"
import { resolveLyricsWithRust } from "@/lib/rust-lyrics-resolver"

const mockOrchestrate = vi.mocked(orchestrateLyricsSearch)
const mockPrefetch = vi.mocked(prefetchEnglishCandidates)
const mockResolvePrefetch = vi.mocked(resolveEnglishFromPrefetch)
const mockResolveRust = vi.mocked(resolveLyricsWithRust)

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
    mockResolveRust.mockReset()
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
    expect(result.romaji.lines).toEqual(["betsu no sekai e"])
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
    expect(result.english.lines).toEqual([])
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

  it("forwards cancellation and surfaces Rust metadata and result events", async () => {
    const controller = new AbortController()
    const onResolutionEvent = vi.fn()
    const onProgress = vi.fn()
    mockResolveRust.mockImplementation(async (_request, options) => {
      expect(options.signal).toBe(controller.signal)
      options.onEvent?.({
        event: "metadata",
        protocolVersion: "1",
        requestId: "request-123",
        timestamp: "2026-06-19T12:00:00.000Z",
        data: { title: "Resolved title", author: "Resolved artist" },
      })
      options.onEvent?.({
        event: "result",
        protocolVersion: "1",
        requestId: "request-123",
        timestamp: "2026-06-19T12:00:00.000Z",
        data: {
          outcome: "not_found",
          resolution: "native",
          videoId: "dQw4w9WgXcQ",
          metadata: {
            title: "Resolved title",
            author: "Resolved artist",
            duration: 214,
            language: "en",
          },
          lyrics: null,
          alternates: [],
          message: "No native lyrics found",
        },
      })
      return {
        outcome: "not_found",
        resolution: "native",
        videoId: "dQw4w9WgXcQ",
        metadata: {
          title: "Resolved title",
          author: "Resolved artist",
          duration: 214,
          language: "en",
        },
        lyrics: null,
        alternates: [],
        message: "No native lyrics found",
      }
    })

    await runLyricsPipeline({
      track: "Never Gonna Give You Up",
      artist: "Rick Astley",
      title: "Rick Astley - Never Gonna Give You Up",
      durationSec: 214,
      videoId: "dQw4w9WgXcQ",
      useExperimentalRustResolver: true,
      resolutionSignal: controller.signal,
      onResolutionEvent,
      onProgress,
    })

    expect(onResolutionEvent).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "No native lyrics found",
        step: "ready",
      }),
    )
  })

  it("falls back to the browser orchestrator when the default Rust transport fails", async () => {
    mockResolveRust.mockRejectedValue(new Error("Rust gateway down"))
    mockOrchestrate.mockResolvedValue({
      status: "found",
      strategy: "browser",
      attempts: [],
      providersTried: ["lrclib"],
      message: "browser ok",
      synced: true,
      lyrics: {
        id: 1,
        providerId: "lrclib",
        plainLyrics: "Hello\nWorld",
        syncedLyrics: null,
      },
    })

    const result = await runLyricsPipeline({
      track: "Never Gonna Give You Up",
      artist: "Rick Astley",
      title: "Rick Astley - Never Gonna Give You Up",
      durationSec: 214,
      videoId: "dQw4w9WgXcQ",
      useExperimentalRustResolver: true,
      fallbackToBrowserOnRustFailure: true,
    })

    expect(mockResolveRust).toHaveBeenCalledOnce()
    expect(mockOrchestrate).toHaveBeenCalledOnce()
    expect(result.native.strategy).toBe("browser")
    expect(result.native.message).toBe("browser ok")
  })

  it("does not fall back when Rust resolution is aborted", async () => {
    mockResolveRust.mockRejectedValue(new DOMException("Aborted", "AbortError"))
    mockOrchestrate.mockResolvedValue({
      status: "found",
      strategy: "browser",
      attempts: [],
      providersTried: ["lrclib"],
      message: "browser ok",
      synced: true,
      lyrics: {
        id: 1,
        providerId: "lrclib",
        plainLyrics: "Hello\nWorld",
        syncedLyrics: null,
      },
    })

    await expect(
      runLyricsPipeline({
        track: "Never Gonna Give You Up",
        artist: "Rick Astley",
        title: "Rick Astley - Never Gonna Give You Up",
        durationSec: 214,
        videoId: "dQw4w9WgXcQ",
        useExperimentalRustResolver: true,
        fallbackToBrowserOnRustFailure: true,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })

    expect(mockResolveRust).toHaveBeenCalledOnce()
    expect(mockOrchestrate).not.toHaveBeenCalled()
  })

  it("keeps explicit Rust mode strict on transport failure", async () => {
    mockResolveRust.mockRejectedValue(new Error("Rust gateway down"))
    mockOrchestrate.mockResolvedValue({
      status: "found",
      strategy: "browser",
      attempts: [],
      providersTried: ["lrclib"],
      message: "browser ok",
      synced: true,
      lyrics: {
        id: 1,
        providerId: "lrclib",
        plainLyrics: "Hello\nWorld",
        syncedLyrics: null,
      },
    })

    await expect(
      runLyricsPipeline({
        track: "Never Gonna Give You Up",
        artist: "Rick Astley",
        title: "Rick Astley - Never Gonna Give You Up",
        durationSec: 214,
        videoId: "dQw4w9WgXcQ",
        useExperimentalRustResolver: true,
        fallbackToBrowserOnRustFailure: false,
      }),
    ).rejects.toThrow("Rust gateway down")

    expect(mockResolveRust).toHaveBeenCalledOnce()
    expect(mockOrchestrate).not.toHaveBeenCalled()
  })
})
