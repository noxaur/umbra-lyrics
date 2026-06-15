import { describe, expect, it } from "vitest"
import {
  getEffectiveLineDistance,
  getLyricLineVisual,
  normalizeViewportDistance,
} from "@/lib/lyric-line-visual"

describe("normalizeViewportDistance", () => {
  it("maps pixel offset to line-distance units", () => {
    expect(normalizeViewportDistance(72, 72)).toBe(1)
    expect(normalizeViewportDistance(0, 72)).toBe(0)
  })
})

describe("getEffectiveLineDistance", () => {
  it("uses the smaller of index and viewport distance", () => {
    expect(getEffectiveLineDistance(4, 1)).toBe(1)
    expect(getEffectiveLineDistance(1, 4)).toBe(1)
    expect(getEffectiveLineDistance(3, 0)).toBe(0)
  })
})

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

  it("pops centered lines forward via viewport distance", () => {
    const indexFar = getLyricLineVisual(4, false)
    const centered = getLyricLineVisual(4, false, 0)
    expect(centered.scale).toBeGreaterThan(indexFar.scale)
    expect(centered.opacity).toBeGreaterThan(indexFar.opacity)
    expect(centered.z).toBeGreaterThan(indexFar.z)
  })

  it("interpolates between active and near for fractional viewport distance", () => {
    const half = getLyricLineVisual(2, false, 0.5)
    const active = getLyricLineVisual(0, false)
    const near = getLyricLineVisual(1, false)
    expect(half.scale).toBeGreaterThan(near.scale)
    expect(half.scale).toBeLessThan(active.scale)
  })
})
