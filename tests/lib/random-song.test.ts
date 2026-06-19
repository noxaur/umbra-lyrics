import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  collectLocalRandomSongCandidates,
  pickRandomSongQuery,
  resolveRandomSong,
} from "@/lib/random-song"
import { clearRecentSongs, addRecentSong } from "@/lib/recent-songs"
import { clearPlaylists, createPlaylist, addTrackToPlaylist } from "@/lib/playlists"

vi.mock("@/lib/youtube-search", () => ({
  searchSongs: vi.fn(),
}))

import { searchSongs } from "@/lib/youtube-search"

const mockSearchSongs = vi.mocked(searchSongs)

describe("random-song", () => {
  beforeEach(() => {
    clearRecentSongs()
    clearPlaylists()
    mockSearchSongs.mockReset()
  })

  it("returns a curated search query", () => {
    expect(pickRandomSongQuery().length).toBeGreaterThan(0)
  })

  it("collects recent and playlist tracks without duplicates", () => {
    addRecentSong({
      videoId: "recent1",
      title: "Artist A - Track A",
      artist: "Artist A",
      track: "Track A",
    })

    const { playlist } = createPlaylist("Test")
    addTrackToPlaylist(playlist!.id, {
      videoId: "recent1",
      title: "Artist A - Track A",
      artist: "Artist A",
      track: "Track A",
    })
    addTrackToPlaylist(playlist!.id, {
      videoId: "playlist2",
      title: "Artist B - Track B",
      artist: "Artist B",
      track: "Track B",
    })

    const candidates = collectLocalRandomSongCandidates()
    expect(candidates).toHaveLength(2)
    expect(candidates.map((candidate) => candidate.videoId).sort()).toEqual(["playlist2", "recent1"])
  })

  it("excludes the current video from local candidates", () => {
    addRecentSong({
      videoId: "current",
      title: "Current - Song",
      artist: "Current",
      track: "Song",
    })
    addRecentSong({
      videoId: "other",
      title: "Other - Song",
      artist: "Other",
      track: "Song",
    })

    const candidates = collectLocalRandomSongCandidates("current")
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.videoId).toBe("other")
  })

  it("resolves a random song from search results", async () => {
    mockSearchSongs.mockResolvedValue([
      {
        videoId: "abc123",
        title: "Queen - Bohemian Rhapsody",
        channel: "Queen Official",
        durationSec: 355,
      },
    ])

    const song = await resolveRandomSong()
    expect(song).toMatchObject({
      videoId: "abc123",
      seedMetadata: {
        artist: "Queen",
        track: "Bohemian Rhapsody",
        durationSec: 355,
        source: "youtube-music",
      },
    })
  })

  it("excludes the current video from search results", async () => {
    mockSearchSongs.mockResolvedValue([
      {
        videoId: "current",
        title: "Current - Song",
        channel: "Current",
        durationSec: 200,
      },
      {
        videoId: "other",
        title: "Other - Song",
        channel: "Other",
        durationSec: 210,
      },
    ])

    const song = await resolveRandomSong({ excludeVideoId: "current" })
    expect(song?.videoId).toBe("other")
  })

  it("rethrows abort errors instead of falling back", async () => {
    const controller = new AbortController()
    controller.abort()
    mockSearchSongs.mockRejectedValue(new DOMException("Aborted", "AbortError"))
    addRecentSong({
      videoId: "local1",
      title: "Local - Track",
      artist: "Local",
      track: "Track",
    })

    await expect(resolveRandomSong({ signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    })
  })

  it("falls back to local candidates when search fails", async () => {
    mockSearchSongs.mockRejectedValue(new Error("search down"))
    addRecentSong({
      videoId: "local1",
      title: "Local - Track",
      artist: "Local",
      track: "Track",
    })

    const song = await resolveRandomSong()
    expect(song?.videoId).toBe("local1")
  })
})
