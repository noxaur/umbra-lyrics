import { beforeEach, describe, expect, it } from "vitest"
import {
  clearLyricsCache,
  getLyricsCache,
  setLyricsCache,
} from "@/lib/lyrics-cache"
import {
  clearLyricsRejection,
  isLyricsRejected,
  listRejectedLyrics,
  rejectLyrics,
  rejectLyricsForPlaylist,
  rejectLyricsForTracks,
} from "@/lib/lyrics-rejection"
import { createPlaylist, addTrackToPlaylist } from "@/lib/playlists"

const sampleEntry = {
  videoId: "abc12345678",
  lyricsResult: {
    id: 42,
    providerId: "lrclib" as const,
    plainLyrics: "Line one",
    syncedLyrics: "[00:00.00] Line one",
  },
  providerId: "lrclib" as const,
  lines: [{ startMs: 0, endMs: 3000, text: "Line one" }],
  synced: true,
  englishLines: [] as string[],
  romajiLines: [] as string[],
  romajiStatus: null,
  languageCode: "eng",
  title: "Track - Artist",
  artist: "Artist",
  track: "Track",
}

describe("lyrics-rejection", () => {
  beforeEach(() => {
    clearLyricsCache()
    localStorage.clear()
  })

  it("marks a track as rejected and clears cached lyrics", () => {
    setLyricsCache(sampleEntry)
    expect(getLyricsCache("abc12345678")).not.toBeNull()

    rejectLyrics("abc12345678")

    expect(isLyricsRejected("abc12345678")).toBe(true)
    expect(getLyricsCache("abc12345678")).toBeNull()
    expect(listRejectedLyrics()).toHaveLength(1)
  })

  it("clears rejection state", () => {
    rejectLyrics("abc12345678")
    clearLyricsRejection("abc12345678")
    expect(isLyricsRejected("abc12345678")).toBe(false)
  })

  it("rejects all tracks in a playlist", () => {
    const { playlist } = createPlaylist("Test")
    addTrackToPlaylist(playlist.id, {
      videoId: "video-one1234",
      title: "Song One",
      artist: "Artist",
      track: "Song One",
    })
    addTrackToPlaylist(playlist.id, {
      videoId: "video-two1234",
      title: "Song Two",
      artist: "Artist",
      track: "Song Two",
    })

    setLyricsCache({ ...sampleEntry, videoId: "video-one1234" })

    const count = rejectLyricsForPlaylist(playlist.id)
    expect(count).toBe(2)
    expect(isLyricsRejected("video-one1234")).toBe(true)
    expect(isLyricsRejected("video-two1234")).toBe(true)
    expect(getLyricsCache("video-one1234")).toBeNull()
  })

  it("rejects only selected tracks in a playlist", () => {
    const { playlist } = createPlaylist("Test")
    addTrackToPlaylist(playlist.id, {
      videoId: "video-one1234",
      title: "Song One",
      artist: "Artist",
      track: "Song One",
    })
    addTrackToPlaylist(playlist.id, {
      videoId: "video-two1234",
      title: "Song Two",
      artist: "Artist",
      track: "Song Two",
    })

    rejectLyricsForPlaylist(playlist.id, ["video-one1234"])

    expect(isLyricsRejected("video-one1234")).toBe(true)
    expect(isLyricsRejected("video-two1234")).toBe(false)
  })

  it("rejects explicit track ids", () => {
    rejectLyricsForTracks(["alpha123456", "beta1234567"])
    expect(isLyricsRejected("alpha123456")).toBe(true)
    expect(isLyricsRejected("beta1234567")).toBe(true)
  })
})
