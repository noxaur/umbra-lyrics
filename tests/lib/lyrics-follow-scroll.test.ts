import { describe, expect, it } from "vitest"
import {
  decideLyricsResync,
  findNearestLineIndexToCenter,
  getDistanceFromCenter,
} from "@/lib/lyrics-follow-scroll"

describe("lyrics-follow-scroll", () => {
  it("measures symmetric distance from center line", () => {
    expect(getDistanceFromCenter(4, 5)).toBe(1)
    expect(getDistanceFromCenter(6, 5)).toBe(1)
  })

  it("finds the line nearest viewport center", () => {
    const index = findNearestLineIndexToCenter(
      [
        { index: 0, centerY: 100 },
        { index: 1, centerY: 200 },
        { index: 2, centerY: 300 },
      ],
      210,
    )
    expect(index).toBe(1)
  })

  it("re-syncs within ±1 when scroll was not intentional", () => {
    expect(
      decideLyricsResync({
        activeIndex: 4,
        centerIndex: 5,
        activeExactlyCentered: false,
        intentionalActiveScroll: false,
      }),
    ).toEqual({ action: "resync" })
  })

  it("waits for exact center on intentional active scroll", () => {
    expect(
      decideLyricsResync({
        activeIndex: 4,
        centerIndex: 4,
        activeExactlyCentered: false,
        intentionalActiveScroll: true,
      }),
    ).toEqual({ action: "wait_for_center" })

    expect(
      decideLyricsResync({
        activeIndex: 4,
        centerIndex: 4,
        activeExactlyCentered: true,
        intentionalActiveScroll: true,
      }),
    ).toEqual({ action: "resync" })
  })
})
