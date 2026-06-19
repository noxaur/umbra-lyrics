import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearPlaylistIndexIssues,
  listPlaylistIndexIssues,
  upsertPlaylistIndexIssue,
} from "@/lib/playlist-index-issues"
import { clearPlaylists, createPlaylist } from "@/lib/playlists"
import { enqueuePlaylistLyricsIndexing } from "@/lib/playlist-lyrics-indexer"

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

const mockGetCache = vi.mocked(getLyricsCache)
const mockCacheFromPipeline = vi.mocked(cacheLyricsFromPipeline)
const mockPipeline = vi.mocked(runLyricsPipeline)

describe("playlist lyrics indexer", () => {
  beforeEach(() => {
    clearPlaylists()
    clearPlaylistIndexIssues()
    vi.clearAllMocks()
    mockGetCache.mockReturnValue(null)
    mockCacheFromPipeline.mockReturnValue(true)
  })

  it("records needs_metadata when artist and track cannot be resolved", async () => {
    const { playlist } = createPlaylist("Import test")
    enqueuePlaylistLyricsIndexing(playlist.id, [
      {
        videoId: "dQw4w9WgXcQ",
        title: "Untitled upload",
        artist: "",
        track: "",
      },
    ])

    await vi.waitFor(() => {
      expect(listPlaylistIndexIssues()).toHaveLength(1)
    })

    const issue = listPlaylistIndexIssues()[0]
    expect(issue.reason).toBe("needs_metadata")
    expect(issue.playlistId).toBe(playlist.id)
    expect(mockPipeline).not.toHaveBeenCalled()
  })

  it("skips tracks that are already cached", async () => {
    mockGetCache.mockReturnValue({
      v: 8,
      videoId: "abc123def45",
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
    })

    const { playlist } = createPlaylist("Cached")
    enqueuePlaylistLyricsIndexing(playlist.id, [
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
      },
    ])

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockPipeline).not.toHaveBeenCalled()
    expect(listPlaylistIndexIssues()).toHaveLength(0)
  })

  it("records index_failed when pipeline returns not_found", async () => {
    mockCacheFromPipeline.mockReturnValue(false)
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
      timings: { nativeMs: 1, englishMs: 0, parallelMs: 1 },
    })

    const { playlist } = createPlaylist("Fail test")
    enqueuePlaylistLyricsIndexing(playlist.id, [
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
        durationSec: 200,
      },
    ])

    await vi.waitFor(() => {
      expect(listPlaylistIndexIssues()).toHaveLength(1)
    })

    expect(listPlaylistIndexIssues()[0].reason).toBe("index_failed")
  })

  it("clears issues after successful cache write", async () => {
    upsertPlaylistIndexIssue({
      videoId: "abc123def45",
      playlistId: "playlist-test",
      title: "Artist - Song",
      artist: "Artist",
      track: "Song",
      reason: "index_failed",
      message: "old",
    })

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
          plainLyrics: "Hello\nWorld",
          syncedLyrics: null,
        },
      },
      english: { lines: [], source: "translated", status: "failed" },
      timings: { nativeMs: 1, englishMs: 0, parallelMs: 1 },
    })

    const { playlist } = createPlaylist("Success")
    enqueuePlaylistLyricsIndexing(playlist.id, [
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
        durationSec: 200,
      },
    ])

    await vi.waitFor(() => {
      expect(listPlaylistIndexIssues()).toHaveLength(0)
    })
    expect(mockCacheFromPipeline).toHaveBeenCalled()
    expect(mockPipeline.mock.calls[0]?.[0]).toMatchObject({ skipTranscription: true })
  })
})
