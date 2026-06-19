import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { RandomSongButton } from "@/components/random-song-button"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("@/lib/random-song", () => ({
  resolveRandomSong: vi.fn(),
}))

import { resolveRandomSong } from "@/lib/random-song"

const mockResolveRandomSong = vi.mocked(resolveRandomSong)

function renderButton(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<RandomSongButton />} />
        <Route path="/play/:videoId" element={<RandomSongButton />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("RandomSongButton", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockResolveRandomSong.mockReset()
  })

  it("navigates to a random song with player state", async () => {
    mockResolveRandomSong.mockResolvedValue({
      videoId: "abc123",
      seedMetadata: {
        artist: "Queen",
        track: "Bohemian Rhapsody",
        durationSec: 355,
        source: "youtube-music",
      },
    })

    renderButton()

    fireEvent.click(screen.getByRole("button", { name: "Play a random song" }))

    await waitFor(() => {
      expect(mockResolveRandomSong).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeVideoId: undefined,
          signal: expect.any(AbortSignal),
        }),
      )
    })

    expect(mockNavigate).toHaveBeenCalledWith("/play/abc123", {
      state: {
        fromHome: true,
        seedMetadata: {
          artist: "Queen",
          track: "Bohemian Rhapsody",
          durationSec: 355,
          source: "youtube-music",
        },
        canonicalChecked: "abc123",
      },
    })
  })

  it("excludes the current video when already on a player route", async () => {
    mockResolveRandomSong.mockResolvedValue({
      videoId: "other123",
      seedMetadata: {
        artist: "Other",
        track: "Song",
        source: "youtube-music",
      },
    })

    renderButton("/play/current123")

    fireEvent.click(screen.getByRole("button", { name: "Play a random song" }))

    await waitFor(() => {
      expect(mockResolveRandomSong).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeVideoId: "current123",
        }),
      )
    })
  })

  it("shows an error when no random song is available", async () => {
    mockResolveRandomSong.mockResolvedValue(null)

    renderButton()

    fireEvent.click(screen.getByRole("button", { name: "Play a random song" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("No random song found")
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
