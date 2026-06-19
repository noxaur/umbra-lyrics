import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearPlaylistIndexIssues,
  listPlaylistIndexIssues,
} from "@/lib/playlist-index-issues"
import { clearPlaylists, createPlaylist, addTrackToPlaylist } from "@/lib/playlists"
import {
  enqueuePlaylistLyricsIndexing,
  getPlaylistIndexingState,
  getPlaylistIndexingSummary,
  subscribePlaylistIndexing,
  waitForPlaylistIndexingIdle,
} from "@/lib/playlist-lyrics-indexer"

vi.mock("@/lib/cache-lyrics-from-pipeline", () => ({
  cacheLyricsFromPipeline: vi.fn(() => true),
  mergeEnglishIntoCache: vi.fn(),
}))

vi.mock("@/lib/lyrics-cache", () => ({
  getLyricsCache: vi.fn(() => null),
}))

vi.mock("@/lib/lyrics-pipeline", () => ({
  runLyricsPipeline: vi.fn(),
}))

vi.mock("@/lib/track-metadata-resolver", () => ({
  resolveTrackMetadata: vi.fn(async ({ roughArtist, roughTrack, title }) => ({
    artist: roughArtist ?? "",
    track: roughTrack ?? title,
    source: "parse" as const,
    confidence: 0.3,
    alternates: [],
  })),
}))

vi.mock("@/lib/youtube-oembed", () => ({
  fetchYouTubeAuthor: vi.fn(async () => null),
}))

import { getLyricsCache } from "@/lib/lyrics-cache"
import { cacheLyricsFromPipeline } from "@/lib/cache-lyrics-from-pipeline"
import { runLyricsPipeline } from "@/lib/lyrics-pipeline"
import type { LyricsPipelineResult } from "@/lib/lyrics-pipeline"

const mockGetCache = vi.mocked(getLyricsCache)
const mockCacheFromPipeline = vi.mocked(cacheLyricsFromPipeline)
const mockPipeline = vi.mocked(runLyricsPipeline)

function mockCacheLikeProduction(
  _input: unknown,
  pipeline: LyricsPipelineResult,
): boolean {
  const native = pipeline.native
  return (native.status === "found" || native.status === "instrumental") && Boolean(native.lyrics)
}

describe("playlist lyrics indexer events", () => {
  beforeEach(() => {
    clearPlaylists()
    clearPlaylistIndexIssues()
    vi.clearAllMocks()
    mockGetCache.mockReturnValue(null)
    mockCacheFromPipeline.mockImplementation(mockCacheLikeProduction)
  })

  it("reports idle after indexing completes", async () => {
    mockPipeline.mockResolvedValue({
      native: {
        status: "found",
        strategy: "test",
        attempts: [],
        providersTried: ["lrclib"],
        message: "ok",
        synced: true,
        lyrics: {
          id: 1,
          providerId: "lrclib",
          plainLyrics: "Hello",
          syncedLyrics: null,
        },
      },
      english: { lines: [], source: "translated", status: "failed" },
      romaji: { lines: [], status: "skipped" },
      timings: { nativeMs: 1, englishMs: 0, parallelMs: 1 },
    })

    const { playlist } = createPlaylist("Events")
    const states: Array<{ activeCount: number; queuedCount: number }> = []
    subscribePlaylistIndexing((id, state) => {
      if (id === playlist.id) states.push(state)
    })

    enqueuePlaylistLyricsIndexing(playlist.id, [
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
        durationSec: 200,
      },
    ])

    await waitForPlaylistIndexingIdle(playlist.id)

    const final = getPlaylistIndexingState(playlist.id)
    expect(final.activeCount).toBe(0)
    expect(final.queuedCount).toBe(0)
    expect(states.some((state) => state.activeCount > 0 || state.queuedCount > 0)).toBe(true)
  })

  it("summarizes cached and failed tracks", async () => {
    mockGetCache.mockImplementation((videoId) =>
      videoId === "cached1234567"
        ? {
            v: 10,
            videoId: "cached1234567",
            lyricsResult: {
              id: 1,
              providerId: "lrclib",
              plainLyrics: "Line",
              syncedLyrics: null,
            },
            providerId: "lrclib",
            lines: [{ startMs: 0, endMs: 1000, text: "Line" }],
            synced: false,
            englishLines: [],
            languageCode: "en",
            title: "Song",
            artist: "Artist",
            track: "Song",
            cachedAt: Date.now(),
          }
        : null,
    )

    mockPipeline.mockResolvedValue({
      native: {
        status: "not_found",
        strategy: "test",
        attempts: [],
        providersTried: [],
        message: "No lyrics found",
        synced: false,
      },
      english: { lines: [], source: "translated", status: "failed" },
      romaji: { lines: [], status: "skipped" },
      timings: { nativeMs: 1, englishMs: 0, parallelMs: 1 },
    })

    const { playlist } = createPlaylist("Summary")
    addTrackToPlaylist(playlist.id, {
      videoId: "cached1234567",
      title: "Cached",
      artist: "Artist",
      track: "Cached",
    })
    addTrackToPlaylist(playlist.id, {
      videoId: "abc123def45",
      title: "Fail",
      artist: "Artist",
      track: "Fail",
    })

    enqueuePlaylistLyricsIndexing(playlist.id)
    await waitForPlaylistIndexingIdle(playlist.id)

    const summary = getPlaylistIndexingSummary(playlist.id)
    expect(summary.total).toBe(2)
    expect(summary.cached).toBe(1)
    expect(summary.failed + summary.needsMetadata).toBeGreaterThan(0)
    expect(listPlaylistIndexIssues()).toHaveLength(1)
  })
})
