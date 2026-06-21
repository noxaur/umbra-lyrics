import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AddToPlaylistMenu } from "@/components/add-to-playlist-menu"
import { PlaylistFormDialog } from "@/components/playlist-form-dialog"
import { addTrackToPlaylist, clearPlaylists, createPlaylist, readPlaylists } from "@/lib/playlists"

const sampleTrack = {
  videoId: "abc123",
  title: "Artist - Song Title",
  artist: "Artist",
  track: "Song Title",
}

describe("AddToPlaylistMenu", () => {
  beforeEach(() => {
    clearPlaylists()
  })

  it("renders an add to playlist trigger", () => {
    render(<AddToPlaylistMenu track={sampleTrack} />)
    expect(screen.getByRole("button", { name: /add to playlist/i })).toBeInTheDocument()
  })

  it("adds tracks through playlist storage helpers", () => {
    const { playlist } = createPlaylist("Friday Night")
    addTrackToPlaylist(playlist.id, sampleTrack)

    expect(readPlaylists()[0].tracks).toHaveLength(1)
    expect(readPlaylists()[0].tracks[0].videoId).toBe("abc123")
  })
})

describe("PlaylistFormDialog", () => {
  it("submits a playlist name", () => {
    const onSubmit = vi.fn()
    render(
      <PlaylistFormDialog
        open
        title="New playlist"
        submitLabel="Create"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/playlist name/i), {
      target: { value: "Road Trip" },
    })
    fireEvent.click(screen.getByRole("button", { name: /create/i }))

    expect(onSubmit).toHaveBeenCalledWith("Road Trip")
  })
})
