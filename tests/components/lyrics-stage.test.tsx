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
      lyricsFollowMode: "follow",
      loadedFromCache: false,
      tvMode: false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("recenters after active line index changes", async () => {
    const easeSpy = vi.spyOn(lyricScroll, "scrollLineToCenterEase")

    render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      await flushFrames()
    })

    easeSpy.mockClear()

    await act(async () => {
      usePlayerStore.setState({ currentTime: 28 })
      await flushFrames()
    })

    expect(easeSpy).toHaveBeenCalled()
    const lastCall = easeSpy.mock.calls.at(-1)
    expect(lastCall?.[3]).toEqual({ force: true })
  })

  it("recenters when bilingual display mode changes line height", async () => {
    const easeSpy = vi.spyOn(lyricScroll, "scrollLineToCenterEase")

    render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      usePlayerStore.setState({ currentTime: 20 })
      await flushFrames()
    })

    easeSpy.mockClear()

    await act(async () => {
      usePlayerStore.setState({
        displayMode: "both",
        englishLines: makeLines(30).map((line) => `${line.text} (EN)`),
      })
      await flushFrames()
    })

    expect(easeSpy).toHaveBeenCalled()
  })
})
