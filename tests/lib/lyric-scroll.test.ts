import { describe, it, expect } from "vitest"
import { getScrollBehavior, isOutsideCenterThird } from "@/lib/lyric-scroll"

function mockRect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe("isOutsideCenterThird", () => {
  it("returns false when element center is in middle third", () => {
    const container = { getBoundingClientRect: () => mockRect(0, 300) } as HTMLElement
    const element = { getBoundingClientRect: () => mockRect(100, 40) } as HTMLElement
    expect(isOutsideCenterThird(element, container)).toBe(false)
  })

  it("returns true when element center is above middle third", () => {
    const container = { getBoundingClientRect: () => mockRect(0, 300) } as HTMLElement
    const element = { getBoundingClientRect: () => mockRect(10, 40) } as HTMLElement
    expect(isOutsideCenterThird(element, container)).toBe(true)
  })

  it("returns true when element center is below middle third", () => {
    const container = { getBoundingClientRect: () => mockRect(0, 300) } as HTMLElement
    const element = { getBoundingClientRect: () => mockRect(220, 40) } as HTMLElement
    expect(isOutsideCenterThird(element, container)).toBe(true)
  })
})

describe("getScrollBehavior", () => {
  it("returns auto when reduced motion preferred", () => {
    expect(getScrollBehavior(true)).toBe("auto")
  })

  it("returns smooth otherwise", () => {
    expect(getScrollBehavior(false)).toBe("smooth")
  })
})
