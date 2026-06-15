import { describe, it, expect } from "vitest"
import { getLyricStageState, getActiveLineIndex } from "@/lib/sync-engine"
import type { LyricLine } from "@/types/lyrics"

const lines: LyricLine[] = [
  { startMs: 5000, endMs: 8000, text: "Hello" },
  { startMs: 25000, endMs: 28000, text: "World" },
]

describe("getLyricStageState", () => {
  it("shows intro before first lyric", () => {
    const state = getLyricStageState(lines, 2000, 0, 60000)
    expect(state.mode).toBe("intro")
    expect(state.gapLabel).toContain("Intro")
  })

  it("shows gap during instrumental break", () => {
    const state = getLyricStageState(lines, 15000, 0, 60000)
    expect(state.mode).toBe("gap")
    expect(state.gapLabel).toContain("Instrumental")
    expect(getActiveLineIndex(lines, 15000, 0)).toBe(-1)
  })

  it("highlights active lyric line", () => {
    const state = getLyricStageState(lines, 6000, 0, 60000)
    expect(state.mode).toBe("lyric")
    expect(state.activeIndex).toBe(0)
  })
})
