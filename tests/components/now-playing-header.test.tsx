import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { NowPlayingHeader } from "@/components/now-playing-header"
import { setLyricsCache } from "@/lib/lyrics-cache"
import { usePlayerStore } from "@/stores/player-store"

describe("NowPlayingHeader lyrics rejection", () => {
  beforeEach(() => {
    localStorage.clear()
    usePlayerStore.setState({
      videoId: "abc_123",
      title: "Artist - Track",
      artist: "Artist",
      track: "Track",
      status: "ready",
      lyrics: [{ text: "Displayed lyric", startMs: 0, endMs: 1000 }],
      lyricsSource: "lrclib",
      lyricsSynced: true,
      lyricsAutoTimed: false,
      lyricsAligned: false,
      lyricsAlternates: [],
      lyricsProvidersSearched: ["lrclib"],
      lyricsAttempts: ["lrclib:exact"],
      englishLines: [],
      englishSource: null,
    })
  })

  it("opens a categorized GitHub issue from the report modal", () => {
    setLyricsCache({
      videoId: "abc_123",
      lyricsResult: {
        id: 42,
        providerId: "lrclib",
        plainLyrics: "Raw plain lyric",
        syncedLyrics: "[00:01.00] Raw synced lyric",
      },
      lines: [{ text: "Displayed lyric", startMs: 0, endMs: 1000 }],
      synced: true,
      englishLines: [],
      languageCode: "en",
      title: "Artist - Track",
      artist: "Artist",
      track: "Track",
    })

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    render(
      <MemoryRouter>
        <NowPlayingHeader />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Report lyrics" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Wrong lyrics" }))
    fireEvent.click(screen.getByRole("button", { name: "Open GitHub issue" }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const url = new URL(openSpy.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe(
      "https://github.com/noxaur/umbra-lyrics/issues/new",
    )
    expect(url.searchParams.get("title")).toContain("Wrong lyrics")
    expect(url.searchParams.get("body")).toContain("## Issue type")
    expect(url.searchParams.get("body")).toContain("Wrong lyrics")

    openSpy.mockRestore()
  })

  it("shows a report action when the track has no lyrics", () => {
    usePlayerStore.setState({
      lyrics: [],
      lyricsSource: null,
      lyricsAlternates: [],
      lyricsProvidersSearched: ["lrclib"],
      lyricsAttempts: ["lrclib:exact"],
    })

    render(
      <MemoryRouter>
        <NowPlayingHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole("button", { name: "Report lyrics" })).toBeInTheDocument()
  })

  it("hides the rejection action for pasted lyrics", () => {
    usePlayerStore.setState({ lyricsSource: "pasted" })

    render(
      <MemoryRouter>
        <NowPlayingHeader />
      </MemoryRouter>,
    )

    expect(screen.queryByRole("button", { name: "Report lyrics" })).not.toBeInTheDocument()
  })
})
