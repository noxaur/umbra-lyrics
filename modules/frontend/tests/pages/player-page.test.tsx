import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { PlayerPage } from "@/pages/player-page"
import { usePlayerStore } from "@/stores/player-store"
import { ThemeProvider } from "@/components/theme-provider"
import type { ResolvedTrackMetadata } from "@/lib/track-metadata-resolver"

const youtubePlayback = {
  isPlaying: false,
  play: vi.fn(),
  pause: vi.fn(),
}

vi.mock("@/hooks/use-youtube-player", () => ({
  useYouTubePlayer: (videoId: string) => ({
    containerRef: { current: null },
    ready: true,
    currentTime: 0,
    duration: 250,
    isPlaying: youtubePlayback.isPlaying,
    error: null,
    play: youtubePlayback.play,
    pause: youtubePlayback.pause,
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

vi.mock("@/lib/canonical-music-video", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canonical-music-video")>()
  return {
    ...actual,
    resolveCanonicalMusicVideo: vi.fn(async () => ({
      ok: false as const,
      reason: "metadata_unconfirmed" as const,
    })),
  }
})

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
    youtubePlayback.isPlaying = false
    usePlayerStore.setState({
      videoId: null,
      title: "",
      artist: "",
      track: "",
      status: "idle",
      stageFullscreen: false,
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

describe("PlayerPage stage fullscreen controls", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    youtubePlayback.isPlaying = false
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
      constructor(_callback: ResizeObserverCallback) {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    vi.mocked(resolveTrackMetadata).mockResolvedValue({
      artist: "TK from Ling tosite Sigure",
      track: "Unravel",
      source: "parse",
      confidence: 0.9,
      durationSec: 250,
      alternates: [],
    })
    usePlayerStore.setState({
      videoId: "Fve_lHIPa-I",
      title: "Unravel",
      artist: "TK from Ling tosite Sigure",
      track: "Unravel",
      status: "ready",
      stageFullscreen: true,
      lyrics: [{ startMs: 0, endMs: 10_000, text: "test line" }],
      englishLines: [],
      romajiLines: [],
      lyricsOutcome: "found",
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

  it("shows a play control in stage fullscreen and toggles playback", () => {
    renderPlayer("Fve_lHIPa-I")

    const playButton = screen.getByRole("button", { name: "Play" })
    expect(playButton).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Seek" })).not.toBeInTheDocument()

    fireEvent.click(playButton)
    expect(youtubePlayback.play).toHaveBeenCalledTimes(1)
  })
})
