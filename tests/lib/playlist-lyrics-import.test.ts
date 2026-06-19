import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearPlaylistIndexIssues,
  upsertPlaylistIndexIssue,
} from "@/lib/playlist-index-issues"
import { clearPlaylists, createPlaylist } from "@/lib/playlists"
import {
  applyPlaylistImportRowMetadataEdit,
  commitPlaylistLyricsImportRows,
  preparePlaylistLyricsImportRows,
  rowCanImport,
  rowsFromIndexIssues,
  scanPlaylistLyricsImportRow,
} from "@/lib/playlist-lyrics-import"
import { rejectLyrics } from "@/lib/lyrics-rejection"

vi.mock("@/lib/cache-lyrics-from-pipeline", () => ({
  cacheLyricsFromPipeline: vi.fn(() => true),
}))

vi.mock("@/lib/lyrics-cache", () => ({
  getLyricsCache: vi.fn(() => null),
  clearLyricsCache: vi.fn(),
}))

vi.mock("@/lib/lyrics-orchestrator", () => ({
  orchestrateLyricsSearch: vi.fn(),
}))

vi.mock("@/lib/track-metadata-resolver", () => ({
  resolveTrackMetadata: vi.fn(async ({ roughArtist, roughTrack, title }) => ({
    artist: roughArtist ?? "Resolved Artist",
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
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"

const mockGetCache = vi.mocked(getLyricsCache)
const mockCacheFromPipeline = vi.mocked(cacheLyricsFromPipeline)
const mockOrchestrate = vi.mocked(orchestrateLyricsSearch)

describe("playlist lyrics import", () => {
  beforeEach(() => {
    clearPlaylists()
    clearPlaylistIndexIssues()
    localStorage.clear()
    vi.clearAllMocks()
    mockGetCache.mockReturnValue(null)
    mockCacheFromPipeline.mockReturnValue(true)
  })

  it("prepares rows for uncached tracks as selected pending", () => {
    const rows = preparePlaylistLyricsImportRows([
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
      },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("pending")
    expect(rows[0].selected).toBe(true)
  })

  it("preserves mediaSource when preparing rows from canonical tracks", () => {
    const rows = preparePlaylistLyricsImportRows([
      {
        videoId: "canonical01",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
        mediaSource: "music.youtube",
      },
    ])

    expect(rows[0].mediaSource).toBe("music.youtube")
  })

  it("prepares rejected tracks as unselected with rejected status", () => {
    rejectLyrics("abc123def45")

    const rows = preparePlaylistLyricsImportRows([
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
      },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("rejected")
    expect(rows[0].selected).toBe(false)
  })

  it("scan skips orchestrator for rejected tracks", async () => {
    rejectLyrics("abc123def45")

    const result = await scanPlaylistLyricsImportRow({
      videoId: "abc123def45",
      title: "Artist - Song",
      artist: "Artist",
      track: "Song",
      durationSec: 200,
      selected: true,
      status: "pending",
      alternates: [],
    })

    expect(result.status).toBe("rejected")
    expect(result.selected).toBe(false)
    expect(mockOrchestrate).not.toHaveBeenCalled()
  })

  it("excludes cached tracks by default", () => {
    mockGetCache.mockReturnValue({
      v: 10,
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

    const rows = preparePlaylistLyricsImportRows([
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
      },
    ])

    expect(rows).toHaveLength(0)
  })

  it("maps scan results to ready when orchestrator finds lyrics", async () => {
    mockOrchestrate.mockResolvedValue({
      status: "found",
      strategy: "lrclib",
      providerId: "lrclib",
      attempts: [],
      providersTried: ["lrclib"],
      message: "Found",
      synced: true,
      lyrics: {
        id: 1,
        providerId: "lrclib",
        plainLyrics: "Hello",
        syncedLyrics: "[00:00.00]Hello",
      },
      alternates: [],
    })

    const result = await scanPlaylistLyricsImportRow({
      videoId: "abc123def45",
      title: "Artist - Song",
      artist: "Artist",
      track: "Song",
      durationSec: 200,
      selected: true,
      status: "pending",
      alternates: [],
    })

    expect(result.status).toBe("ready")
    expect(result.selectedAlternate?.providerId).toBe("lrclib")
  })

  it("maps scan results to needs_metadata when artist is missing", async () => {
    const { resolveTrackMetadata } = await import("@/lib/track-metadata-resolver")
    vi.mocked(resolveTrackMetadata).mockResolvedValueOnce({
      artist: "",
      track: "Song only",
      source: "parse",
      confidence: 0.1,
      alternates: [],
    })

    const result = await scanPlaylistLyricsImportRow({
      videoId: "abc123def45",
      title: "Song only",
      artist: "",
      track: "Song only",
      durationSec: 0,
      selected: true,
      status: "pending",
      alternates: [],
    })

    expect(result.status).toBe("needs_metadata")
    expect(mockOrchestrate).not.toHaveBeenCalled()
  })

  it("commits selected rows and clears index issues", () => {
    const { playlist } = createPlaylist("Commit test")
    upsertPlaylistIndexIssue({
      videoId: "abc123def45",
      playlistId: playlist.id,
      title: "Artist - Song",
      artist: "Artist",
      track: "Song",
      reason: "index_failed",
      message: "failed",
    })

    const alternate = {
      providerId: "lrclib" as const,
      id: 1,
      synced: true,
      lineCount: 1,
      rankScore: 1,
      lyricsResult: {
        id: 1,
        providerId: "lrclib" as const,
        plainLyrics: "Hello",
        syncedLyrics: "[00:00.00]Hello",
      },
    }

    const result = commitPlaylistLyricsImportRows(playlist.id, [
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
        durationSec: 200,
        selected: true,
        status: "ready",
        alternates: [alternate],
        selectedAlternate: alternate,
      },
    ])

    expect(result.imported).toBe(1)
    expect(mockCacheFromPipeline).toHaveBeenCalled()
  })

  it("builds issue-only rows", () => {
    const rows = rowsFromIndexIssues(
      [
        {
          videoId: "abc123def45",
          title: "One",
          artist: "A",
          track: "One",
        },
        {
          videoId: "def456ghi78",
          title: "Two",
          artist: "B",
          track: "Two",
        },
      ],
      [
        {
          videoId: "abc123def45",
          artist: "A",
          track: "One",
          message: "No lyrics",
          reason: "index_failed",
        },
      ],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].videoId).toBe("abc123def45")
    expect(rows[0].status).toBe("no_match")
  })

  it("rowCanImport accepts pasted lyrics", () => {
    expect(
      rowCanImport({
        videoId: "abc123def45",
        title: "Song",
        artist: "Artist",
        track: "Song",
        durationSec: 0,
        selected: true,
        status: "pasted",
        pastedLyrics: "Line one",
        alternates: [],
      }),
    ).toBe(true)
  })

  it("uses manual artist and track for search when both are provided", async () => {
    mockOrchestrate.mockResolvedValue({
      status: "found",
      strategy: "lrclib",
      providerId: "lrclib",
      attempts: [],
      providersTried: ["lrclib"],
      message: "Found",
      synced: true,
      lyrics: {
        id: 1,
        providerId: "lrclib",
        plainLyrics: "Hello",
        syncedLyrics: "[00:00.00]Hello",
      },
      alternates: [],
    })

    await scanPlaylistLyricsImportRow({
      videoId: "abc123def45",
      title: "Wrong - Parsed",
      artist: "Manual Artist",
      track: "Manual Track",
      durationSec: 200,
      selected: true,
      status: "pending",
      alternates: [],
    })

    expect(mockOrchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: "Manual Artist",
        track: "Manual Track",
      }),
    )
  })

  it("invalidates stale matches when metadata is edited", () => {
    const alternate = {
      providerId: "lrclib" as const,
      id: 1,
      synced: true,
      lineCount: 1,
      rankScore: 1,
      lyricsResult: {
        id: 1,
        providerId: "lrclib" as const,
        plainLyrics: "Hello",
        syncedLyrics: null,
      },
    }

    const next = applyPlaylistImportRowMetadataEdit(
      {
        videoId: "abc123def45",
        title: "Artist - Song",
        artist: "Old Artist",
        track: "Old Song",
        durationSec: 200,
        selected: true,
        status: "ready",
        alternates: [alternate],
        selectedAlternate: alternate,
      },
      { artist: "New Artist" },
    )

    expect(next.artist).toBe("New Artist")
    expect(next.status).toBe("pending")
    expect(next.selectedAlternate).toBeUndefined()
    expect(next.alternates).toEqual([])
    expect(next.message).toMatch(/retry auto-match/i)
  })
})
