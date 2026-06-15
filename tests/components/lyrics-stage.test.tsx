import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LyricsStage } from "@/components/lyrics-stage"
import * as lyricScroll from "@/lib/lyric-scroll"
import { usePlayerStore } from "@/stores/player-store"
import type { LyricLine } from "@/types/lyrics"

function makeLines(count: number): LyricLine[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Chorus line number ${i + 1} for scroll test`,
    startMs: i * 2000,
    endMs: (i + 1) * 2000,
    kind: "lyric" as const,
  }))
}

function flushFrames() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

describe("LyricsStage scroll", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
      constructor(_callback: ResizeObserverCallback) {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    usePlayerStore.setState({
      status: "ready",
      lyricsOutcome: "found",
      lyrics: makeLines(30),
      englishLines: [],
      displayMode: "native",
      currentTime: 0,
      syncOffsetMs: 0,
      lyricsSynced: true,
      loadedFromCache: false,
      tvMode: false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("recenters after active line index changes", async () => {
    const scrollSpy = vi.spyOn(lyricScroll, "scrollLineToCenter")

    render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      await flushFrames()
    })

    scrollSpy.mockClear()

    await act(async () => {
      usePlayerStore.setState({ currentTime: 28 })
      await flushFrames()
    })

    expect(scrollSpy).toHaveBeenCalled()
    const lastCall = scrollSpy.mock.calls.at(-1)
    expect(lastCall?.[3]).toEqual({ force: true })
  })

  it("recenters when bilingual display mode changes line height", async () => {
    const scrollSpy = vi.spyOn(lyricScroll, "scrollLineToCenter")

    render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      usePlayerStore.setState({ currentTime: 20 })
      await flushFrames()
    })

    scrollSpy.mockClear()

    await act(async () => {
      usePlayerStore.setState({
        displayMode: "both",
        englishLines: makeLines(30).map((line) => `${line.text} (EN)`),
      })
      await flushFrames()
    })

    expect(scrollSpy).toHaveBeenCalled()
  })

  it("does not double-scroll on active line changes", async () => {
    const scrollSpy = vi.spyOn(lyricScroll, "scrollLineToCenter")

    render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      await flushFrames()
    })

    scrollSpy.mockClear()

    await act(async () => {
      usePlayerStore.setState({ currentTime: 28 })
      await flushFrames()
    })

    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })

  it("shows instrumental placeholder without lyric list during long gaps", () => {
    usePlayerStore.setState({
      lyrics: [
        { text: "Verse", startMs: 5_000, endMs: 8_000, kind: "lyric" },
        { text: "Chorus", startMs: 25_000, endMs: 28_000, kind: "lyric" },
      ],
      currentTime: 15,
      lyricsSynced: true,
    })

    const { getAllByText, queryByRole } = render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    expect(getAllByText("♪ Instrumental ♪").length).toBeGreaterThanOrEqual(1)
    expect(queryByRole("button", { name: /verse/i })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: /chorus/i })).not.toBeInTheDocument()
  })

  it("shows outro placeholder without lyric list after final timestamp", () => {
    usePlayerStore.setState({
      lyrics: [
        { text: "Verse", startMs: 5_000, endMs: 8_000, kind: "lyric" },
        { text: "Chorus", startMs: 25_000, endMs: 28_000, kind: "lyric" },
      ],
      currentTime: 55,
      lyricsSynced: true,
    })

    const { getAllByText, queryByRole } = render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    expect(getAllByText("♪ Outro ♪").length).toBeGreaterThanOrEqual(1)
    expect(queryByRole("button", { name: /verse/i })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: /chorus/i })).not.toBeInTheDocument()
  })

  it("shows intro placeholder without lyric list before first timestamp", async () => {
    usePlayerStore.setState({
      lyrics: [
        { text: "First line", startMs: 18_000, endMs: 22_000, kind: "lyric" },
        { text: "Second line", startMs: 22_000, endMs: 26_000, kind: "lyric" },
      ],
      currentTime: 5,
      lyricsSynced: true,
    })

    const { getByText, queryByRole } = render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={214_000} />
      </div>,
    )

    expect(getByText("Lyrics start at 00:18.00")).toBeInTheDocument()
    expect(queryByRole("button", { name: /first line/i })).not.toBeInTheDocument()
  })
})
