import { describe, it, expect, vi } from "vitest"
import {
  FAST_LINE_CHANGE_MS,
  getDistanceFromActive,
  getLineHandoffDurationMs,
  getScrollBehavior,
  IDLE_DISTANCE_FROM_ACTIVE,
  isOutsideCenterThird,
  LINE_HANDOFF_MS,
  scrollLineToCenter,
} from "@/lib/lyric-scroll"

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

describe("getLineHandoffDurationMs", () => {
  it("returns 0 when reduced motion preferred", () => {
    expect(getLineHandoffDurationMs(true)).toBe(0)
    expect(getLineHandoffDurationMs(true, 0)).toBe(0)
  })

  it("returns full handoff when motion allowed", () => {
    expect(getLineHandoffDurationMs(false)).toBe(LINE_HANDOFF_MS)
    expect(getLineHandoffDurationMs(false, FAST_LINE_CHANGE_MS)).toBe(LINE_HANDOFF_MS)
    expect(getLineHandoffDurationMs(false, FAST_LINE_CHANGE_MS - 1)).toBe(LINE_HANDOFF_MS)
    expect(getLineHandoffDurationMs(false, 100)).toBe(LINE_HANDOFF_MS)
  })
})

describe("getScrollBehavior", () => {
  it("returns auto when reduced motion preferred", () => {
    expect(getScrollBehavior(true)).toBe("auto")
    expect(getScrollBehavior(true, 0)).toBe("auto")
  })

  it("returns smooth when motion allowed", () => {
    expect(getScrollBehavior(false)).toBe("smooth")
    expect(getScrollBehavior(false, FAST_LINE_CHANGE_MS)).toBe("smooth")
    expect(getScrollBehavior(false, FAST_LINE_CHANGE_MS - 1)).toBe("smooth")
  })
})

describe("getDistanceFromActive", () => {
  it("returns line offset when a line is active", () => {
    expect(getDistanceFromActive(5, 3)).toBe(2)
    expect(getDistanceFromActive(1, 3)).toBe(-2)
  })

  it("returns uniform idle distance when no line is active", () => {
    expect(getDistanceFromActive(0, -1)).toBe(IDLE_DISTANCE_FROM_ACTIVE)
    expect(getDistanceFromActive(12, -1)).toBe(IDLE_DISTANCE_FROM_ACTIVE)
  })
})

describe("scrollLineToCenter", () => {
  function mockScrollContainer(top = 0, height = 300) {
    const state = { scrollTop: top }
    return {
      getBoundingClientRect: () => mockRect(0, height),
      clientHeight: height,
      get scrollTop() {
        return state.scrollTop
      },
      set scrollTop(v: number) {
        state.scrollTop = v
      },
      scrollTo: vi.fn(({ top }: { top: number }) => {
        state.scrollTop = top
      }),
      _state: state,
    } as unknown as HTMLElement
  }

  it("skips scroll when element is already centered unless forced", () => {
    const container = mockScrollContainer()
    const element = { getBoundingClientRect: () => mockRect(100, 40) } as HTMLElement

    scrollLineToCenter(element, container, "smooth")
    expect(container.scrollTop).toBe(0)
    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it("scrolls when element is outside center third", () => {
    const container = mockScrollContainer()
    const element = { getBoundingClientRect: () => mockRect(220, 40) } as HTMLElement

    scrollLineToCenter(element, container, "auto")
    expect(container.scrollTop).toBe(90)
  })

  it("scrolls when forced even if element is in center third", () => {
    const container = mockScrollContainer(0, 300)
    const element = { getBoundingClientRect: () => mockRect(130, 40) } as HTMLElement

    scrollLineToCenter(element, container, "smooth", { force: true })
    expect(container.scrollTo).toHaveBeenCalled()
  })
})
