import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it } from "vite-plus/test"
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

  it("links to a prefilled GitHub issue using cached raw lyrics", () => {
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

    render(
      <MemoryRouter>
        <NowPlayingHeader />
      </MemoryRouter>,
    )

    const link = screen.getByRole("link", { name: "Reject lyrics" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    const url = new URL(link.getAttribute("href") ?? "")
    expect(url.origin + url.pathname).toBe(
      "https://github.com/noxaur/umbra-lyrics/issues/new",
    )
    expect(url.searchParams.get("body")).toContain("[00:01.00] Raw synced lyric")
  })

  it("hides the rejection action for pasted lyrics", () => {
    usePlayerStore.setState({ lyricsSource: "pasted" })

    render(
      <MemoryRouter>
        <NowPlayingHeader />
      </MemoryRouter>,
    )

    expect(screen.queryByRole("link", { name: "Reject lyrics" })).not.toBeInTheDocument()
  })
})
