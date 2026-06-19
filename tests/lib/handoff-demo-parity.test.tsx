import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LyricsStage } from "@/components/lyrics-stage"
import { usePlayerStore } from "@/stores/player-store"
import type { LyricLine } from "@/types/lyrics"

const HANDOFF_LINES = [
  "We're no strangers to love",
  "You know the rules and so do I",
  "A full commitment's what I'm thinking of",
  "You wouldn't get this from any other guy",
  "Never gonna give you up",
]

function makeHandoffLines(): LyricLine[] {
  return HANDOFF_LINES.map((text, i) => ({
    text,
    startMs: i * 2800,
    endMs: (i + 1) * 2800,
    kind: "lyric" as const,
  }))
}

function flushFrames() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

describe("handoff-demo parity (lyrics stage structure)", () => {
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
      lyrics: makeHandoffLines(),
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

  it("uses handoff v3 stage chrome, spacing, and line styling hooks", async () => {
    const { container } = render(
      <div className="flex h-[402px] min-h-0 flex-col">
        <LyricsStage durationMs={60_000} />
      </div>,
    )

    await act(async () => {
      await flushFrames()
    })

    const stage = container.querySelector("[data-lyrics-follow]") as HTMLElement
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      "[data-lyrics-follow] button[type='button']",
    )
    const active = [...buttons].find((b) => b.getAttribute("aria-current") === "true")
    const inactive = [...buttons].find((b) => b.getAttribute("aria-current") !== "true")
    const inner = stage.querySelector<HTMLElement>("[style*='preserve-3d']")

    expect(stage.className).not.toContain("rounded-2xl")
    expect(stage.className).not.toContain("border")
    expect(stage.className).not.toContain("bg-karaoke-stage-bg")
    expect(stage.className).toContain("scroll-py-10")
    expect(stage.className).toContain("max-h-full")
    expect(inner?.className).toContain("gap-[0.65rem]")
    expect(inner?.parentElement?.className).toContain("max-w-xl")

    expect(active?.className).toContain("text-karaoke-active-line")
    expect(inactive?.className).toContain("text-karaoke-ink")
    expect(active?.className).toContain("max-w-xl")
    expect(active?.className).toContain("py-[0.55rem]")
    expect(active?.style.textShadow).toContain("24px")
    expect(active?.style.textShadow).toContain("40%")
    expect(inactive?.style.textShadow).toBe("none")
  })
})
