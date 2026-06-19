import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSongSearch } from "@/hooks/use-song-search"

vi.mock("@/lib/youtube-search", () => ({
  searchSongs: vi.fn(),
}))

import { searchSongs } from "@/lib/youtube-search"

const mockSearchSongs = vi.mocked(searchSongs)

const searchHit = {
  videoId: "abc",
  title: "Queen - Track",
  channel: "Queen",
  durationSec: 200,
}

describe("useSongSearch", () => {
  beforeEach(() => {
    mockSearchSongs.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("debounces typed queries before searching", async () => {
    vi.useFakeTimers()
    mockSearchSongs.mockResolvedValue([searchHit])

    const { result } = renderHook(() => useSongSearch({ debounceMs: 600 }))

    act(() => {
      result.current.setQuery("queen")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(mockSearchSongs).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockSearchSongs).toHaveBeenCalledWith("queen", {
      limit: 10,
      signal: expect.any(AbortSignal),
    })
    expect(result.current.status).toBe("results")
    expect(result.current.results).toHaveLength(1)
  })

  it("ignores stale responses after the query changes", async () => {
    vi.useFakeTimers()
    let resolveFirst: ((value: typeof searchHit[]) => void) | undefined
    mockSearchSongs
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useSongSearch({ debounceMs: 100 }))

    act(() => {
      result.current.setQuery("queen bohemian")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      await Promise.resolve()
    })

    act(() => {
      result.current.setQuery("queen bohemian live")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      await Promise.resolve()
    })

    resolveFirst?.([searchHit])
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.results).toEqual([])
    expect(result.current.status).toBe("error")
  })

  it("does not fall into a permanent searching state after aborting", async () => {
    vi.useFakeTimers()
    mockSearchSongs.mockImplementation(
      (_query, options) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        }),
    )

    const { result } = renderHook(() => useSongSearch({ debounceMs: 100 }))

    act(() => {
      result.current.setQuery("queen bohemian")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      await Promise.resolve()
    })

    expect(result.current.isSearching).toBe(true)

    act(() => {
      result.current.setQuery("queen bohemian live")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
      await Promise.resolve()
    })

    expect(result.current.isSearching).toBe(false)
  })
})
