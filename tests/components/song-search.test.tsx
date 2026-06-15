import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SongSearch } from "@/components/song-search"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("@/lib/youtube-search", () => ({
  searchSongs: vi.fn(),
  formatSongDuration: (seconds: number | null) => (seconds ? "4:00" : null),
  formatViewCount: () => "1M views",
}))

import { searchSongs } from "@/lib/youtube-search"

const mockSearchSongs = vi.mocked(searchSongs)

describe("SongSearch", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockSearchSongs.mockReset()
  })

  it("searches on submit and navigates on result click", async () => {
    mockSearchSongs.mockResolvedValue([
      {
        videoId: "dQw4w9WgXcQ",
        title: "Queen - Bohemian Rhapsody",
        channel: "Queen Official",
        durationSec: 240,
        viewCount: 1_000_000,
      },
    ])

    render(
      <MemoryRouter>
        <SongSearch />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText(/search songs/i), {
      target: { value: "queen bohemian" },
    })
    fireEvent.click(screen.getByRole("button", { name: /search/i }))

    await waitFor(() => {
      expect(mockSearchSongs).toHaveBeenCalledWith("queen bohemian", { limit: 10 })
    })

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /queen · bohemian rhapsody/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("option", { name: /queen · bohemian rhapsody/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
      state: { fromHome: true },
    })
  })

  it("navigates with arrow keys and enter", async () => {
    mockSearchSongs.mockResolvedValue([
      {
        videoId: "aaaaaaaaaaa",
        title: "First Song",
        channel: "Channel A",
        durationSec: 180,
      },
      {
        videoId: "bbbbbbbbbbb",
        title: "Second Song",
        channel: "Channel B",
        durationSec: 200,
      },
    ])

    render(
      <MemoryRouter>
        <SongSearch />
      </MemoryRouter>,
    )

    const input = screen.getByPlaceholderText(/search songs/i)
    fireEvent.change(input, { target: { value: "test query" } })
    fireEvent.click(screen.getByRole("button", { name: /search/i }))

    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(2)
    })

    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(mockNavigate).toHaveBeenCalledWith("/play/bbbbbbbbbbb", {
      state: { fromHome: true },
    })
  })

  it("opens pasted YouTube links immediately", async () => {
    vi.useFakeTimers()

    render(
      <MemoryRouter>
        <SongSearch />
      </MemoryRouter>,
    )

    const input = screen.getByPlaceholderText(/search songs/i)
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    })

    await vi.runAllTimersAsync()

    expect(mockNavigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
      state: { fromHome: true },
    })

    vi.useRealTimers()
  })
})
