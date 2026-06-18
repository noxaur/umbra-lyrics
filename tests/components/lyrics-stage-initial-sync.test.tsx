import { act, render } from "@testing-library/react"
import {
  forwardRef,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ForwardedRef,
} from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import * as lyricScroll from "@/lib/lyric-scroll"
import { usePlayerStore } from "@/stores/player-store"
import type { LyricLine } from "@/types/lyrics"

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

vi.mock("@/components/lyric-line", () => ({
  LyricLine: forwardRef<
    HTMLButtonElement,
    ComponentPropsWithoutRef<"button"> & { text: string }
  >(function DelayedLyricLine({ text, ...props }, ref) {
    const elementRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
      let frame = 0
      const attachAfterLayout = (remaining: number) => {
        frame = requestAnimationFrame(() => {
          if (remaining > 1) attachAfterLayout(remaining - 1)
          else assignRef(ref, elementRef.current)
        })
      }
      attachAfterLayout(4)
      return () => {
        cancelAnimationFrame(frame)
        assignRef(ref, null)
      }
    }, [ref])

    return (
      <button ref={elementRef} type="button" {...props}>
        {text}
      </button>
    )
  }),
}))

import { LyricsStage } from "@/components/lyrics-stage"

function makeLines(count: number): LyricLine[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Delayed lyric ${i + 1}`,
    startMs: i * 2000,
    endMs: (i + 1) * 2000,
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

describe("LyricsStage initial sync", () => {
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
      currentTime: 28,
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

  it("centers active lyric when its ref becomes available after initial layout", async () => {
    const easeSpy = vi.spyOn(lyricScroll, "scrollLineToCenterEase")

    render(
      <div className="flex h-96 min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      await flushFrames(8)
    })

    expect(easeSpy).toHaveBeenCalled()
    const lastCall = easeSpy.mock.calls.at(-1)
    expect(lastCall?.[3]).toMatchObject({ force: true })
    expect(usePlayerStore.getState().lyricsFollowMode).toBe("follow")
  })
})
