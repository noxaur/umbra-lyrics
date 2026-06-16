import { beforeEach, describe, expect, it } from "vitest"
import {
  addTrackToPlaylist,
  clearPlaylists,
  createPlaylist,
  deletePlaylist,
  getPlaylistById,
  movePlaylistTrack,
  readPlaylists,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  renamePlaylist,
} from "@/lib/playlists"

const sampleTrack = {
  videoId: "abc123",
  title: "Artist - Song Title",
  artist: "Artist",
  track: "Song Title",
}

const sampleTrack2 = {
  videoId: "def456",
  title: "Other - Another Song",
  artist: "Other",
  track: "Another Song",
}

describe("playlists", () => {
  beforeEach(() => {
    clearPlaylists()
  })

  it("creates a playlist with a generated id", () => {
    const { playlist, error } = createPlaylist("Karaoke Night")
    expect(error).toBeUndefined()
    expect(playlist.name).toBe("Karaoke Night")
    expect(playlist.id).toMatch(/^playlist-/)
    expect(playlist.tracks).toEqual([])
    expect(readPlaylists()).toHaveLength(1)
  })

  it("renames and deletes playlists", () => {
    const { playlist } = createPlaylist("Old name")
    renamePlaylist(playlist.id, "New name")
    expect(getPlaylistById(playlist.id)?.name).toBe("New name")
    deletePlaylist(playlist.id)
    expect(getPlaylistById(playlist.id)).toBeUndefined()
  })

  it("adds tracks and dedupes by videoId", () => {
    const { playlist } = createPlaylist("Set list")
    addTrackToPlaylist(playlist.id, sampleTrack)
    addTrackToPlaylist(playlist.id, sampleTrack2)
    addTrackToPlaylist(playlist.id, sampleTrack)

    const updated = getPlaylistById(playlist.id)
    expect(updated?.tracks).toHaveLength(2)
    expect(updated?.tracks.map((t) => t.videoId)).toEqual(["def456", "abc123"])
  })

  it("removes tracks from a playlist", () => {
    const { playlist } = createPlaylist("Set list")
    addTrackToPlaylist(playlist.id, sampleTrack)
    addTrackToPlaylist(playlist.id, sampleTrack2)
    removeTrackFromPlaylist(playlist.id, sampleTrack.videoId)

    expect(getPlaylistById(playlist.id)?.tracks).toHaveLength(1)
    expect(getPlaylistById(playlist.id)?.tracks[0].videoId).toBe("def456")
  })

  it("reorders tracks", () => {
    const { playlist } = createPlaylist("Set list")
    addTrackToPlaylist(playlist.id, sampleTrack)
    addTrackToPlaylist(playlist.id, sampleTrack2)

    reorderPlaylistTracks(playlist.id, 0, 1)
    expect(getPlaylistById(playlist.id)?.tracks.map((t) => t.videoId)).toEqual([
      "def456",
      "abc123",
    ])
  })

  it("moves tracks up and down", () => {
    const { playlist } = createPlaylist("Set list")
    addTrackToPlaylist(playlist.id, sampleTrack)
    addTrackToPlaylist(playlist.id, sampleTrack2)

    movePlaylistTrack(playlist.id, "abc123", "down")
    expect(getPlaylistById(playlist.id)?.tracks.map((t) => t.videoId)).toEqual([
      "def456",
      "abc123",
    ])
  })

  it("recovers from corrupt storage", () => {
    localStorage.setItem(
      "song-kara-playlists",
      JSON.stringify([
        { id: "playlist-bad", name: "Bad", createdAt: "x", updatedAt: "x", tracks: "nope" },
        {
          id: "playlist-good",
          name: "Good",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          tracks: [{ ...sampleTrack, addedAt: 1 }],
        },
      ]),
    )

    const playlists = readPlaylists()
    expect(playlists).toHaveLength(1)
    expect(playlists[0].name).toBe("Good")
  })
})
