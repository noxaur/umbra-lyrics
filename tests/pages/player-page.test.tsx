import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { PlayerPage } from "@/pages/player-page"
import { usePlayerStore } from "@/stores/player-store"
import { ThemeProvider } from "@/components/theme-provider"
import type { ResolvedTrackMetadata } from "@/lib/track-metadata-resolver"

vi.mock("@/hooks/use-youtube-player", () => ({
  useYouTubePlayer: (videoId: string) => ({
    containerRef: { current: null },
    ready: true,
    currentTime: 0,
    duration: 250,
    isPlaying: false,
    error: null,
    playbackHint: null,
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getVideoTitle: vi.fn(async () =>
      videoId === "Fve_lHIPa-I"
        ? "TK from 凛として時雨 『unravel』 Music Video(Full Size)"
        : '[SPOILER] [AMV/MAD] Orb : On the Movements of the Earth - Sakanaction "Kaiju" [JP/EN lyrics]',
    ),
  }),
}))

vi.mock("@/lib/youtube-oembed", () => ({
  fetchYouTubeAuthor: vi.fn(async (videoId: string) =>
    videoId === "Fve_lHIPa-I" ? "凛として時雨 / TK" : "SBG",
  ),
}))

vi.mock("@/lib/track-metadata-resolver", () => ({
  resolveTrackMetadata: vi.fn(),
}))

import { resolveTrackMetadata } from "@/lib/track-metadata-resolver"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function NavigateToUnravel() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate("/play/Fve_lHIPa-I")}>
      go unravel
    </button>
  )
}

function renderPlayer(initialVideoId: string) {
  return render(
    <MemoryRouter initialEntries={[`/play/${initialVideoId}`]}>
      <ThemeProvider>
        <NavigateToUnravel />
        <Routes>
          <Route path="/play/:videoId" element={<PlayerPage />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe("PlayerPage metadata routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    usePlayerStore.setState({
      videoId: null,
      title: "",
      artist: "",
      track: "",
      status: "idle",
      lyrics: [],
      englishLines: [],
      romajiLines: [],
      lyricsOutcome: null,
      lyricsSearchPhase: null,
      lyricsSearchStep: null,
      lyricsAttempts: [],
      lyricsAlternates: [],
      lyricsProvidersSearched: [],
      loadedFromCache: false,
      lrclibTrackId: null,
      contentWarning: null,
      verificationScore: null,
    })
  })

  it("ignores metadata resolved for a previous video after navigation", async () => {
    const staleKaiju = deferred<ResolvedTrackMetadata>()
    const currentUnravel: ResolvedTrackMetadata = {
      artist: "TK from Ling tosite Sigure",
      track: "Unravel",
      source: "parse",
      confidence: 0.9,
      durationSec: 250,
      alternates: [],
    }

    vi.mocked(resolveTrackMetadata)
      .mockReturnValueOnce(staleKaiju.promise)
      .mockResolvedValueOnce(currentUnravel)

    renderPlayer("KaijuVid001")

    await waitFor(() => expect(resolveTrackMetadata).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("button", { name: "go unravel" }))

    await waitFor(() => expect(resolveTrackMetadata).toHaveBeenCalledTimes(2))
    await screen.findByDisplayValue("TK from Ling tosite Sigure")

    await act(async () => {
      staleKaiju.resolve({
        artist: "Sakanaction",
        track: "Kaiju",
        source: "parse",
        confidence: 0.9,
        durationSec: 250,
        alternates: [],
      })
      await staleKaiju.promise
    })

    expect(screen.getByDisplayValue("TK from Ling tosite Sigure")).toBeInTheDocument()
    expect(screen.queryByDisplayValue("Sakanaction")).not.toBeInTheDocument()
  })
})
