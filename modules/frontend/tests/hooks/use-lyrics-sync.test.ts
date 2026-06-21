import { renderHook, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useLyricsSync } from "@/hooks/use-lyrics-sync"
import { usePlayerStore } from "@/stores/player-store"

describe("useLyricsSync", () => {
  beforeEach(() => {
    usePlayerStore.setState({ currentTime: 0 })
    vi.stubGlobal("performance", { now: () => 1000 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("extrapolates playback time between embed polls while playing", async () => {
    const playback = { timeSec: 10, isPlaying: true }
    const getPlayback = () => playback

    renderHook(() => useLyricsSync(getPlayback))

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })

    expect(usePlayerStore.getState().currentTime).toBe(10)

    vi.stubGlobal("performance", { now: () => 1030 })

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })

    expect(usePlayerStore.getState().currentTime).toBeCloseTo(10.03, 2)
  })

  it("does not extrapolate when paused", async () => {
    const playback = { timeSec: 5, isPlaying: false }
    const getPlayback = () => playback

    renderHook(() => useLyricsSync(getPlayback))

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })

    expect(usePlayerStore.getState().currentTime).toBe(5)

    vi.stubGlobal("performance", { now: () => 2000 })

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })

    expect(usePlayerStore.getState().currentTime).toBe(5)
  })
})
