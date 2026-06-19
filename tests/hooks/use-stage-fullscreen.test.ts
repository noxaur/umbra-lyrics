import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createRef } from "react"
import { useStageFullscreen } from "@/hooks/use-stage-fullscreen"
import { usePlayerStore } from "@/stores/player-store"

describe("useStageFullscreen", () => {
  beforeEach(() => {
    usePlayerStore.setState({ stageFullscreen: false })
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true,
    })
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
      writable: true,
    })
  })

  it("enters native fullscreen when supported", async () => {
    const el = document.createElement("div")
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const ref = createRef<HTMLDivElement>()
    ref.current = el

    const { result } = renderHook(() => useStageFullscreen(ref))

    await act(async () => {
      await result.current.enter()
    })

    expect(el.requestFullscreen).toHaveBeenCalled()
  })

  it("falls back to immersive mode when fullscreen request fails", async () => {
    const el = document.createElement("div")
    el.requestFullscreen = vi.fn().mockRejectedValue(new Error("blocked"))
    const ref = createRef<HTMLDivElement>()
    ref.current = el

    const { result } = renderHook(() => useStageFullscreen(ref))

    await act(async () => {
      await result.current.enter()
    })

    expect(usePlayerStore.getState().stageFullscreen).toBe(true)
  })

  it("syncs store state from fullscreenchange events", () => {
    const el = document.createElement("div")
    const ref = createRef<HTMLDivElement>()
    ref.current = el

    const { result } = renderHook(() => useStageFullscreen(ref))

    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: el,
      })
      document.dispatchEvent(new Event("fullscreenchange"))
    })

    expect(usePlayerStore.getState().stageFullscreen).toBe(true)
    expect(result.current.nativeFullscreen).toBe(true)
  })

  it("exits immersive mode without calling exitFullscreen", async () => {
    usePlayerStore.setState({ stageFullscreen: true })
    const ref = createRef<HTMLDivElement>()
    ref.current = document.createElement("div")

    const { result } = renderHook(() => useStageFullscreen(ref))

    await act(async () => {
      await result.current.exit()
    })

    expect(document.exitFullscreen).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().stageFullscreen).toBe(false)
  })
})
