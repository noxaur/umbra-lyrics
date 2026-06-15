import { describe, expect, it } from "vitest"
import {
  createRafThrottle,
  focusFactorFromDistancePx,
  viewportDistancePx,
} from "@/lib/lyric-viewport-depth"

describe("lyric-viewport-depth", () => {
  it("returns 1 at stage center", () => {
    expect(focusFactorFromDistancePx(0, 600)).toBe(1)
  })

  it("falls off linearly toward edges", () => {
    expect(focusFactorFromDistancePx(150, 600)).toBeCloseTo(0.5)
    expect(focusFactorFromDistancePx(300, 600)).toBe(0)
  })

  it("measures absolute distance between centers", () => {
    expect(viewportDistancePx(100, 250)).toBe(150)
    expect(viewportDistancePx(400, 250)).toBe(150)
  })

  it("throttles to one rAF callback per burst", () => {
    let count = 0
    const throttled = createRafThrottle(() => {
      count++
    })
    throttled()
    throttled()
    throttled()
    expect(count).toBe(0)
  })
})
