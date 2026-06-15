import { describe, expect, it } from "vitest"
import {
  getLyricLineVisual,
  getLyricLineVisualFromViewport,
  opacityFromScale,
} from "@/lib/lyric-line-visual"

describe("opacityFromScale", () => {
  it("is 1 at full scale and fades twice as fast", () => {
    expect(opacityFromScale(1)).toBe(1)
    expect(opacityFromScale(0.92)).toBeCloseTo(0.84)
    expect(opacityFromScale(0.78)).toBeCloseTo(0.56)
  })
})

describe("getLyricLineVisual", () => {
  it("peaks at viewport center with full opacity", () => {
    const center = getLyricLineVisual(0, false)
    expect(center.scale).toBe(1)
    expect(center.opacity).toBe(1)
    expect(center.z).toBe(0)
    expect(center.blur).toBe(0)
  })

  it("mirrors distance above and below center", () => {
    const above = getLyricLineVisual(1, false)
    const below = getLyricLineVisual(-1, false)
    expect(above).toEqual(below)
  })

  it("uses spotify-ish steps for near lines", () => {
    const near = getLyricLineVisual(1, false)
    expect(near.scale).toBeCloseTo(0.92)
    expect(near.opacity).toBeCloseTo(0.84)
    expect(near.z).toBe(-12)
    expect(near.blur).toBeCloseTo(0.5)
  })

  it("clamps distant lines at d>=3", () => {
    const far = getLyricLineVisual(5, false)
    expect(far.scale).toBe(0.78)
    expect(far.opacity).toBeCloseTo(0.56)
    expect(far.z).toBe(-36)
    expect(far.blur).toBe(2)
  })

  it("flattens the curve in tv mode", () => {
    const nearTv = getLyricLineVisual(1, false, true)
    expect(nearTv.scale).toBeCloseTo(0.95)
    expect(nearTv.z).toBe(-10)
  })

  it("strips depth motion when reduced motion is on", () => {
    const far = getLyricLineVisual(4, true)
    expect(far.scale).toBe(1)
    expect(far.z).toBe(0)
    expect(far.blur).toBe(0)
    expect(far.opacity).toBe(1)
  })

  it("interpolates smoothly between tiers for fractional viewport distance", () => {
    const halfStep = getLyricLineVisualFromViewport(30, 60, false)
    expect(halfStep.scale).toBeCloseTo(0.96)
    expect(halfStep.opacity).toBeCloseTo(0.92)
    expect(halfStep.z).toBeCloseTo(-6)
    expect(halfStep.blur).toBeCloseTo(0.25)
  })
})
