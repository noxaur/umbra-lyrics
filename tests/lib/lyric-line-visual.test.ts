import { describe, expect, it } from "vitest"
import { getLyricLineVisual } from "@/lib/lyric-line-visual"

describe("getLyricLineVisual", () => {
  it("emphasizes the active line in full motion mode", () => {
    const active = getLyricLineVisual(0, false)
    expect(active.scale).toBeGreaterThanOrEqual(1)
    expect(active.opacity).toBe(1)
    expect(active.z).toBeGreaterThan(0)
    expect(active.blur).toBe(0)
  })

  it("softens adjacent lines", () => {
    const near = getLyricLineVisual(1, false)
    expect(near.scale).toBeLessThan(getLyricLineVisual(0, false).scale)
    expect(near.opacity).toBeCloseTo(0.85)
  })

  it("fades and blurs distant lines", () => {
    const far = getLyricLineVisual(4, false)
    expect(far.scale).toBeLessThanOrEqual(0.8)
    expect(far.opacity).toBeGreaterThanOrEqual(0.35)
    expect(far.blur).toBeGreaterThan(0)
  })

  it("uses opacity-only visuals when reduced motion is on", () => {
    const active = getLyricLineVisual(0, true)
    const far = getLyricLineVisual(4, true)
    expect(active.scale).toBe(1)
    expect(active.z).toBe(0)
    expect(far.blur).toBe(0)
    expect(far.opacity).toBeLessThan(active.opacity)
  })
})
