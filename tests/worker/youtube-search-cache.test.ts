import { describe, expect, it, beforeEach } from "vitest"
import {
  readCachedSearch,
  resetYouTubeSearchCache,
  searchCacheKey,
  withSearchDedup,
  writeCachedSearch,
} from "../../worker/lib/youtube-search-cache"

describe("youtube-search-cache", () => {
  beforeEach(() => {
    resetYouTubeSearchCache()
  })

  it("builds stable cache keys", () => {
    expect(searchCacheKey(" Queen ", 10)).toBe("queen::10")
  })

  it("returns cached results before they expire", () => {
    const key = searchCacheKey("queen", 10)
    writeCachedSearch(key, [{ videoId: "abc", title: "Queen", channel: "Queen", durationSec: 200 }])

    expect(readCachedSearch(key)).toHaveLength(1)
  })

  it("dedupes concurrent searches for the same key", async () => {
    const key = searchCacheKey("queen", 10)
    let calls = 0

    const fetcher = () =>
      new Promise<Array<{ videoId: string; title: string; channel: string; durationSec: number }>>(
        (resolve) => {
          calls += 1
          setTimeout(
            () => resolve([{ videoId: "abc", title: "Queen", channel: "Queen", durationSec: 200 }]),
            10,
          )
        },
      )

    const [first, second] = await Promise.all([
      withSearchDedup(key, fetcher),
      withSearchDedup(key, fetcher),
    ])

    expect(calls).toBe(1)
    expect(first).toEqual(second)
    expect(readCachedSearch(key)).toEqual(first)
  })
})
