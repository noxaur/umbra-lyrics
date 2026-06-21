import { describe, it, expect } from "vitest"
import { getActiveLineIndex, getWordProgress } from "@/lib/sync-engine"
import type { LyricLine } from "@/types/lyrics"

const lines: LyricLine[] = [
  { startMs: 0, endMs: 5000, text: "First" },
  { startMs: 5000, endMs: 10000, text: "Second" },
  { startMs: 10000, endMs: 15000, text: "Third" },
]

describe("getActiveLineIndex", () => {
  it("returns first line at start", () => {
    expect(getActiveLineIndex(lines, 0, 0)).toBe(0)
  })

  it("returns correct line mid-song", () => {
    expect(getActiveLineIndex(lines, 6000, 0)).toBe(1)
  })

  it("respects offset", () => {
    expect(getActiveLineIndex(lines, 4000, 1000)).toBe(1)
  })

  it("returns -1 before first line", () => {
    expect(getActiveLineIndex(lines, -100, 0)).toBe(-1)
  })
})

describe("getWordProgress", () => {
  it("returns 0 at line start", () => {
    expect(getWordProgress(lines[0], 0)).toBe(0)
  })

  it("returns 0.5 at midpoint", () => {
    expect(getWordProgress(lines[0], 2500)).toBeCloseTo(0.5)
  })

  it("clamps to 1 at end", () => {
    expect(getWordProgress(lines[0], 10000)).toBe(1)
  })
})
