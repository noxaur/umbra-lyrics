import { render, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "@/components/theme-provider"
import { getLyricsCache, reparseCachedLyrics, setLyricsCache } from "@/lib/lyrics-cache"
import { parseLrc } from "@/lib/lrc-parser"
import { usePlayerStore } from "@/stores/player-store"

const VIDEO_ID = "SyncBugTest"
const DURATION_SEC = 200
const SYNCED_LYRICS = `[00:35.00] First lyric line here
[00:40.00] Second lyric line here
[00:45.00] Third lyric line here`

vi.mock("@/hooks/use-youtube-player", () => ({
  PLAYBACK_TIME_POLL_INTERVAL_MS: 50,
  useYouTubePlayer: () => ({
    containerRef: { current: null },
    ready: true,
    currentTime: 0,
    duration: DURATION_SEC,
    isPlaying: false,
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getVideoTitle: vi.fn(async () => "Test Artist - Late Intro"),
  }),
}))

vi.mock("@/lib/youtube-oembed", () => ({
  fetchYouTubeAuthor: vi.fn(async () => "Test Artist"),
}))

vi.mock("@/lib/track-metadata-resolver", () => ({
  resolveTrackMetadata: vi.fn(async () => ({
    artist: "Test Artist",
    track: "Late Intro",
    durationSec: DURATION_SEC,
    source: "parse",
    confidence: 1,
    alternates: [],
  })),
}))

vi.mock("@/lib/canonical-music-video", () => ({
  resolveCanonicalMusicVideo: vi.fn(async (input: { videoId: string }) => ({
    ok: true,
    videoId: input.videoId,
    seedMetadata: undefined,
  })),
  shouldSkipCanonicalResolve: () => true,
}))

vi.mock("@/lib/lyrics-orchestrator", () => ({
  orchestrateLyricsSearch: vi.fn(),
}))

vi.mock("@/lib/lyrics-pipeline", () => ({
  runLyricsPipeline: vi.fn(),
  lyricsResultToNativeLines: vi.fn(() => []),
  lyricsResultSampleText: vi.fn(() => ""),
}))

vi.mock("@/lib/recent-songs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recent-songs")>()
  return {
    ...actual,
    addRecentSong: vi.fn(),
    enrichRecentSongEnglish: vi.fn(async () => undefined),
  }
})

describe("playlist cache hydration sync offset", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    localStorage.clear()
    usePlayerStore.getState().resetSyncOffset()
    usePlayerStore.setState({
      videoId: "",
      status: "idle",
      lyrics: [],
      loadedFromCache: false,
      syncOffsetMs: 0,
    })

    const parsed = parseLrc(SYNCED_LYRICS, DURATION_SEC * 1000)
    setLyricsCache({
      videoId: VIDEO_ID,
      lyricsResult: {
        id: 99,
        providerId: "lrclib",
        plainLyrics: "First lyric line here\nSecond lyric line here\nThird lyric line here",
        syncedLyrics: SYNCED_LYRICS,
      },
      lines: parsed.lines,
      synced: true,
      autoTimed: false,
      aligned: false,
      parsedDurationMs: DURATION_SEC * 1000,
      englishLines: [],
      romajiLines: [],
      romajiStatus: null,
      englishStatus: "skipped",
      languageCode: "eng",
      title: "Test Artist - Late Intro",
      artist: "Test Artist",
      track: "Late Intro",
      alternates: [],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("applies sync offset when playing pre-cached playlist lyrics", async () => {
    const { PlayerPage } = await import("@/pages/player-page")

    render(
      <MemoryRouter initialEntries={[`/play/${VIDEO_ID}`]}>
        <ThemeProvider>
          <Routes>
            <Route path="/play/:videoId" element={<PlayerPage />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(usePlayerStore.getState().status).toBe("ready")
      expect(usePlayerStore.getState().lyrics.length).toBeGreaterThan(0)
    })

    const state = usePlayerStore.getState()
    const cached = getLyricsCache(VIDEO_ID)!
    const reparsed = reparseCachedLyrics(cached, DURATION_SEC * 1000)

    expect(reparsed?.suggestedOffsetMs).toBe(-5000)
    expect(state.syncOffsetMs).toBe(-5000)
  })
})
