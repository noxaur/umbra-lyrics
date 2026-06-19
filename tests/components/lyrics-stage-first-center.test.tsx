import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LyricsStage } from "@/components/lyrics-stage"
import { usePlayerStore } from "@/stores/player-store"
import type { LyricLine } from "@/types/lyrics"

function makeLines(count: number, firstStartMs = 0): LyricLine[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Lyric line ${i + 1} for centering test`,
    startMs: firstStartMs + i * 2000,
    endMs: firstStartMs + (i + 1) * 2000,
    kind: "lyric" as const,
  }))
}

function flushFrames(count: number) {
  return new Promise<void>((resolve) => {
    const next = (remaining: number) => {
      requestAnimationFrame(() => {
        if (remaining > 1) next(remaining - 1)
        else resolve()
      })
    }
    next(count)
  })
}

function centerOffsetPx(stage: HTMLElement, active: HTMLElement): number {
  const stageRect = stage.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  const stageCenter = stageRect.top + stageRect.height / 2
  const activeCenter = activeRect.top + activeRect.height / 2
  return activeCenter - stageCenter
}

function MobilePlayerChrome({ height = 667 }: { height?: number }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden" style={{ height }}>
      <header className="flex shrink-0 items-center border-b border-border px-4 py-3">
        <span className="text-lg font-semibold">song-kara</span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="stage-fullscreen relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="stage-video-column flex shrink-0 flex-col px-4 py-2">
              <div className="mx-auto h-[100px] w-full max-w-3xl rounded-lg border border-border" />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border px-3 py-2">
                <p className="truncate text-sm font-semibold">Track title</p>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <LyricsStage durationMs={60_000} />
              </div>
            </div>
            <div className="shrink-0 border-t border-border px-3 py-1.5">
              <div className="h-16" />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

describe("LyricsStage first lyric centering", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      private callback: ResizeObserverCallback
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      trigger() {
        this.callback([], this as unknown as ResizeObserver)
      }
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
      lyrics: makeLines(20, 0),
      englishLines: [],
      displayMode: "native",
      currentTime: 0.5,
      syncOffsetMs: 0,
      lyricsSynced: true,
      lyricsFollowMode: "follow",
      loadedFromCache: false,
      tvMode: false,
      focusMode: false,
      stageFullscreen: false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([220, 280, 340])(
    "centers the first active lyric within tolerance at %ipx stage height",
    async (height) => {
      const { container } = render(
        <div className="flex flex-col" style={{ height }} data-testid="shell">
          <LyricsStage durationMs={60_000} />
        </div>,
      )

      await act(async () => {
        await flushFrames(12)
      })

      const stage = container.querySelector("[data-lyrics-follow]") as HTMLElement
      const active = container.querySelector(
        "[data-lyrics-follow] button[aria-current='true']",
      ) as HTMLElement

      expect(stage).toBeTruthy()
      expect(active).toBeTruthy()

      const offset = centerOffsetPx(stage, active)
      expect(Math.abs(offset)).toBeLessThanOrEqual(24)
    },
  )

  it("centers the intro placeholder in the mobile player chrome layout", async () => {
    usePlayerStore.setState({ currentTime: 0, lyrics: makeLines(20, 5000) })

    const { container } = render(<MobilePlayerChrome height={667} />)

    await act(async () => {
      await flushFrames(8)
    })

    const stage = container.querySelector("[data-lyrics-follow]") as HTMLElement
    const placeholder = container.querySelector("[data-lyrics-follow] [role='status']") as HTMLElement

    expect(stage).toBeTruthy()
    expect(placeholder?.textContent).toContain("Intro")

    const stageRect = stage.getBoundingClientRect()
    const placeholderRect = placeholder.getBoundingClientRect()
    const offset =
      placeholderRect.top + placeholderRect.height / 2 - (stageRect.top + stageRect.height / 2)

    expect(Math.abs(offset)).toBeLessThanOrEqual(24)
  })

  it("centers the first lyric in the mobile player chrome layout", async () => {
    const { container } = render(<MobilePlayerChrome height={667} />)

    await act(async () => {
      await flushFrames(12)
    })

    const stage = container.querySelector("[data-lyrics-follow]") as HTMLElement
    const active = container.querySelector(
      "[data-lyrics-follow] button[aria-current='true']",
    ) as HTMLElement

    expect(stage).toBeTruthy()
    expect(active).toBeTruthy()

    const offset = centerOffsetPx(stage, active)
    expect(Math.abs(offset)).toBeLessThanOrEqual(24)
  })

  it("recenters the first lyric after the stage height changes", async () => {
    const { container } = render(
      <div className="flex flex-col" style={{ height: 320 }} data-testid="shell">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      await flushFrames(12)
    })

    const shell = container.querySelector("[data-testid='shell']") as HTMLElement
    shell.style.height = "240px"
    window.dispatchEvent(new Event("resize"))

    await act(async () => {
      await flushFrames(12)
    })

    const stage = container.querySelector("[data-lyrics-follow]") as HTMLElement
    const active = container.querySelector(
      "[data-lyrics-follow] button[aria-current='true']",
    ) as HTMLElement

    const offset = centerOffsetPx(stage, active)
    expect(Math.abs(offset)).toBeLessThanOrEqual(24)
  })
})
