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
      expect(screen.getByRole("textbox", { name: "Bulk artist" })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole("textbox", { name: "Bulk artist" }), {
      target: { value: "Shared Artist" },
    })
    fireEvent.click(screen.getByRole("button", { name: /apply artist/i }))

    expect(screen.getByLabelText(/artist for song/i)).toHaveValue("Shared Artist")
  })

  it("lets users edit artist and track without selecting the row first", async () => {
    const { playlist } = createPlaylist("Editable metadata")
    const track = {
      videoId: "abc123def45",
      title: "Wrong - Parsed",
      artist: "Wrong Artist",
      track: "Wrong Track",
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

    const artistInput = await screen.findByLabelText(/artist for wrong - parsed/i)
    expect(artistInput).not.toBeDisabled()

    fireEvent.change(artistInput, { target: { value: "Correct Artist" } })
    fireEvent.change(screen.getByLabelText(/track for wrong - parsed/i), {
      target: { value: "Correct Track" },
    })

    expect(artistInput).toHaveValue("Correct Artist")
    expect(screen.getByLabelText(/track for wrong - parsed/i)).toHaveValue("Correct Track")
  })

  it("opens the shared report modal from a row action", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
    const { playlist } = createPlaylist("Report modal")
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
      expect(screen.getByRole("button", { name: /actions for artist - song/i })).toBeInTheDocument()
    })

    const actionsButton = screen.getByRole("button", { name: /actions for artist - song/i })
    fireEvent.pointerDown(actionsButton, { button: 0, ctrlKey: false })
    fireEvent.pointerUp(actionsButton, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole("menuitem", { name: /report on github/i }))

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /what kind of lyrics issue is this\?/i }),
      ).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: /slight sync mismatch/i }))
    fireEvent.click(screen.getByRole("button", { name: /open github issue/i }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const url = new URL(openSpy.mock.calls[0][0] as string)
    expect(url.searchParams.get("body")).toContain("## Issue type")
    expect(url.searchParams.get("body")).toContain("Slight sync mismatch")

    openSpy.mockRestore()
  })
})
