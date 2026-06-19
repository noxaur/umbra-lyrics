import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PlaylistLyricsImportDialog } from "@/components/playlist-lyrics-import-dialog"
import { clearPlaylists, createPlaylist } from "@/lib/playlists"

vi.mock("@/lib/playlist-lyrics-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/playlist-lyrics-import")>()
  return {
    ...actual,
    scanPlaylistLyricsImportRows: vi.fn(async (rows) =>
      rows.map((row) => ({
        ...row,
        status: row.artist && row.track ? ("ready" as const) : ("needs_metadata" as const),
        selectedAlternate:
          row.artist && row.track
            ? {
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
            : undefined,
        alternates: [],
      })),
    ),
    commitPlaylistLyricsImportRows: vi.fn(() => ({ imported: 1, skipped: 0, failed: 0, errors: [] })),
  }
})

describe("PlaylistLyricsImportDialog", () => {
  beforeEach(() => {
    clearPlaylists()
  })

  it("renders interactive import table after scanning", async () => {
    const { playlist } = createPlaylist("Karaoke Night")
    const track = {
      videoId: "abc123def45",
      title: "Artist - Song",
      artist: "Artist",
      track: "Song",
      addedAt: Date.now(),
    }
    const playlists = JSON.parse(localStorage.getItem("umbra-playlists") ?? "[]") as Array<{
      id: string
      tracks: typeof track[]
    }>
    playlists[0].tracks = [track]
    localStorage.setItem("umbra-playlists", JSON.stringify(playlists))

    render(
      <PlaylistLyricsImportDialog
        open
        playlistId={playlist.id}
        onClose={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/artist for artist - song/i)).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /import 1/i })).toBeInTheDocument()
  })

  it("disables import when selected row lacks metadata", async () => {
    const { playlist } = createPlaylist("Needs metadata")
    const track = {
      videoId: "abc123def45",
      title: "Untitled",
      artist: "",
      track: "",
      addedAt: Date.now(),
    }
    const playlists = JSON.parse(localStorage.getItem("umbra-playlists") ?? "[]") as Array<{
      id: string
      tracks: typeof track[]
    }>
    playlists[0].tracks = [track]
    localStorage.setItem("umbra-playlists", JSON.stringify(playlists))

    render(
      <PlaylistLyricsImportDialog
        open
        playlistId={playlist.id}
        onClose={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/track for untitled/i)).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /import/i })).toBeDisabled()
  })

  it("applies bulk artist to selected rows", async () => {
    const { playlist } = createPlaylist("Bulk artist")
    const track = {
      videoId: "abc123def45",
      title: "Song",
      artist: "",
      track: "Song",
      addedAt: Date.now(),
    }
    const playlists = JSON.parse(localStorage.getItem("umbra-playlists") ?? "[]") as Array<{
      id: string
      tracks: typeof track[]
    }>
    playlists[0].tracks = [track]
    localStorage.setItem("umbra-playlists", JSON.stringify(playlists))

    render(
      <PlaylistLyricsImportDialog
        open
        playlistId={playlist.id}
        onClose={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/bulk artist/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/bulk artist/i), {
      target: { value: "Shared Artist" },
    })
    fireEvent.click(screen.getByRole("button", { name: /apply artist/i }))

    expect(screen.getByLabelText(/artist for song/i)).toHaveValue("Shared Artist")
  })
})
