import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, it, expect, beforeEach } from "vitest"
import { TransportControls } from "@/components/transport-controls"
import { usePlayerStore } from "@/stores/player-store"
import { clearSongQueueStorage } from "@/lib/song-queue"

const noop = () => {}

describe("TransportControls queue", () => {
  beforeEach(() => {
    clearSongQueueStorage()
    usePlayerStore.setState({
      syncOffsetMs: 0,
      videoHidden: false,
      focusMode: false,
      stageFullscreen: false,
      tvMode: false,
      displayMode: "native",
      languageCode: "en",
      englishLines: [],
      romajiLines: [],
      playlistContext: null,
      queueContext: null,
    })
  })

  it("renders queue add and view buttons", () => {
    render(
      <MemoryRouter>
        <TransportControls
          duration={120}
          currentTime={30}
          isPlaying={false}
          onPlay={noop}
          onPause={noop}
          onSeek={noop}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole("button", { name: "Add to queue" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Queue" })).toBeInTheDocument()
  })
})
