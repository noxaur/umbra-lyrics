import { describe, expect, it } from "vitest"
import {
  getLyricLineVisual,
  getLyricTextSizeClass,
  getLyricTextTier,
} from "@/lib/lyric-line-visual"

describe("getLyricTextTier", () => {
  it("classifies short, medium, long, and extra-long lines", () => {
    expect(getLyricTextTier("Short line")).toBe("short")
    expect(getLyricTextTier("a".repeat(30))).toBe("medium")
    expect(getLyricTextTier("a".repeat(50))).toBe("long")
    expect(getLyricTextTier("a".repeat(70))).toBe("xlong")
  })
})

describe("getLyricTextSizeClass", () => {
  it("returns smaller active tier for long text", () => {
    const short = getLyricTextSizeClass("Hi", true, false)
    const long = getLyricTextSizeClass("a".repeat(70), true, false)
    expect(short).toContain("2.15rem")
    expect(long).toContain("1.35rem")
  })
})

describe("getLyricLineVisual", () => {
  it("emphasizes the active line in full motion mode", () => {
    const active = getLyricLineVisual(0, false)
    expect(active.scale).toBeGreaterThanOrEqual(1)
    expect(active.scale).toBeLessThanOrEqual(1.05)
    expect(active.opacity).toBe(1)
    expect(active.z).toBeGreaterThan(0)
    expect(active.blur).toBe(0)
    expect(active.y).toBe(0)
  })

  it("softens adjacent lines", () => {
    const near = getLyricLineVisual(1, false)
    expect(near.scale).toBeLessThan(getLyricLineVisual(0, false).scale)
    expect(near.opacity).toBeCloseTo(0.88)
  })

  it("fades and blurs distant lines", () => {
    const far = getLyricLineVisual(4, false)
    expect(far.scale).toBeLessThanOrEqual(0.88)
    expect(far.opacity).toBeGreaterThanOrEqual(0.42)
    expect(far.blur).toBeGreaterThan(0)
  })

  it("uses opacity-only visuals when reduced motion is on", () => {
    const active = getLyricLineVisual(0, true)
    const far = getLyricLineVisual(4, true)
    expect(active.scale).toBe(1)
    expect(active.z).toBe(0)
    expect(active.y).toBe(0)
    expect(far.blur).toBe(0)
    expect(far.opacity).toBeLessThan(active.opacity)
  })

  it("offsets non-active lines vertically for smoother stack motion", () => {
    const above = getLyricLineVisual(-1, false)
    const below = getLyricLineVisual(1, false)
    expect(above.y).toBeLessThan(0)
    expect(below.y).toBeGreaterThan(0)
  })
})
