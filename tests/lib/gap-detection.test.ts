import { describe, it, expect } from "vitest"
import { capLineEndTimes, isInGap, GAP_THRESHOLD_MS } from "@/lib/gap-detection"
import type { LyricLine } from "@/types/lyrics"

describe("gap-detection", () => {
  it("caps long gaps so line endMs does not span entire instrumental", () => {
    const lines: LyricLine[] = [
      { startMs: 0, endMs: 30000, text: "Verse" },
      { startMs: 30000, endMs: 35000, text: "Chorus" },
    ]
    const capped = capLineEndTimes(lines)
    expect(capped[0].endMs).toBeLessThan(30000)
    expect(30000 - capped[0].endMs).toBeGreaterThanOrEqual(GAP_THRESHOLD_MS * 0.3)
  })

  it("detects time inside instrumental gap", () => {
    const lines: LyricLine[] = [
      { startMs: 0, endMs: 5000, text: "A" },
      { startMs: 20000, endMs: 25000, text: "B" },
    ]
    expect(isInGap(lines, 10000)).toBe(true)
    expect(isInGap(lines, 3000)).toBe(false)
  })
})
