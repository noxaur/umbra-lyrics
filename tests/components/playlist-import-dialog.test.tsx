import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PlaylistImportDialog } from "@/components/playlist-import-dialog"
import { clearPlaylists, readPlaylists } from "@/lib/playlists"
import { fetchYouTubePlaylist } from "@/lib/youtube-playlist"

vi.mock("@/lib/youtube-playlist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/youtube-playlist")>()
  return {
    ...actual,
    fetchYouTubePlaylist: vi.fn(),
  }
})

const sampleResponse = {
  playlistId: "PLtest123",
  title: "YouTube Mix",
  items: [
    {
      videoId: "abc123def45",
      title: "Artist - Song",
      channel: "Artist",
      durationSec: 200,
    },
  ],
  truncated: false,
  totalReported: "1",
}

describe("PlaylistImportDialog", () => {
  beforeEach(() => {
    clearPlaylists()
    vi.mocked(fetchYouTubePlaylist).mockReset()
    vi.mocked(fetchYouTubePlaylist).mockResolvedValue(sampleResponse)
  })

  it("shows playlist title on the input step for new imports", () => {
    render(
      <PlaylistImportDialog
        open
        mode="new"
        onImported={() => {}}
        onClose={() => {}}
      />,
    )

    expect(screen.getByLabelText(/playlist title/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/playlist title/i)).not.toBeDisabled()
  })

  it("uses a custom playlist title when provided before loading", async () => {
    const onImported = vi.fn()

    render(
      <PlaylistImportDialog
        open
        mode="new"
        onImported={onImported}
        onClose={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/playlist title/i), {
      target: { value: "Friday Karaoke" },
    })
    fireEvent.change(screen.getByLabelText(/playlist url/i), {
      target: { value: "https://music.youtube.com/playlist?list=PLtest123" },
    })
    fireEvent.click(screen.getByRole("button", { name: /load playlist/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/playlist title/i)).toHaveValue("Friday Karaoke")

    fireEvent.click(screen.getByRole("button", { name: /import/i }))

    await waitFor(() => {
      expect(onImported).toHaveBeenCalled()
    })

    expect(readPlaylists()[0]?.name).toBe("Friday Karaoke")
  })
})
