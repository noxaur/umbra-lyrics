import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it } from "vite-plus/test"
import { NowPlayingOverflowMenu } from "@/components/now-playing-overflow-menu"
import { usePlayerStore } from "@/stores/player-store"

describe("NowPlayingOverflowMenu", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      lyricsSource: "lrclib",
      lyricsAlternates: [],
    })
  })

  it("exposes secondary actions behind a more menu on phones", () => {
    render(
      <MemoryRouter>
        <NowPlayingOverflowMenu
          track={{
            videoId: "abc",
            title: "Title",
            artist: "Artist",
            track: "Track",
          }}
          onRefreshLyrics={() => {}}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole("button", { name: "More track actions" })).toBeInTheDocument()
  })
})
