import { describe, expect, it } from "vitest"
import {
  bumpLyricsLoadGeneration,
  getActiveLyricsLoad,
  getLyricsLoadGeneration,
  isLyricsLoadStale,
  trackLyricsLoad,
} from "@/lib/lyrics-load-coordinator"

describe("lyrics-load-coordinator", () => {
  it("tracks generation per video independently", () => {
    const genA = bumpLyricsLoadGeneration("vid-a")
    const genB = bumpLyricsLoadGeneration("vid-b")
    expect(isLyricsLoadStale("vid-a", genA)).toBe(false)
    expect(isLyricsLoadStale("vid-b", genB)).toBe(false)
    bumpLyricsLoadGeneration("vid-a")
    expect(isLyricsLoadStale("vid-a", genA)).toBe(true)
    expect(isLyricsLoadStale("vid-b", genB)).toBe(false)
  })

  it("registers and clears active loads when the promise settles", async () => {
    const generation = getLyricsLoadGeneration("vid-a")
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    trackLyricsLoad("vid-a", generation, promise)
    expect(getActiveLyricsLoad("vid-a")?.promise).toBe(promise)
    resolve()
    await promise
    expect(getActiveLyricsLoad("vid-a")).toBeUndefined()
  })
})
