import { describe, it, expect, vi } from "vitest"
import {
  FAST_LINE_CHANGE_MS,
  getDistanceFromActive,
  getLineHandoffDurationMs,
  getScrollBehavior,
  IDLE_DISTANCE_FROM_ACTIVE,
  isOutsideCenterThird,
  scrollLineToCenter,
  scrollLineToCenterEase,
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
  it("always returns 0 for instant lyric scroll", () => {
    expect(getLineHandoffDurationMs(true)).toBe(0)
    expect(getLineHandoffDurationMs(false)).toBe(0)
    expect(getLineHandoffDurationMs(false, FAST_LINE_CHANGE_MS - 1)).toBe(0)
    expect(getLineHandoffDurationMs(false, 1000)).toBe(0)
  })
})

describe("getScrollBehavior", () => {
  it("always returns auto for instant lyric scroll", () => {
    expect(getScrollBehavior(true)).toBe("auto")
    expect(getScrollBehavior(false)).toBe("auto")
    expect(getScrollBehavior(false, FAST_LINE_CHANGE_MS - 1)).toBe("auto")
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
  function mockScrollContainer(top = 0, height = 300, scrollHeight = 300) {
    const state = { scrollTop: top }
    return {
      getBoundingClientRect: () => mockRect(0, height),
      clientHeight: height,
      scrollHeight,
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
    const container = mockScrollContainer(0, 300, 600)
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

  it("clamps scroll position to valid range", () => {
    const container = mockScrollContainer(0, 300, 600)
    const element = { getBoundingClientRect: () => mockRect(-50, 40) } as HTMLElement

    scrollLineToCenter(element, container, "auto", { force: true })
    expect(container.scrollTop).toBe(0)

    const bottomElement = { getBoundingClientRect: () => mockRect(700, 40) } as HTMLElement
    scrollLineToCenter(bottomElement, container, "auto", { force: true })
    expect(container.scrollTop).toBe(300)
  })
})

describe("scrollLineToCenterEase", () => {
  function mockScrollContainer(top = 0, height = 300, scrollHeight = 900) {
    const state = { scrollTop: top }
    return {
      getBoundingClientRect: () => mockRect(0, height),
      clientHeight: height,
      scrollHeight,
      get scrollTop() {
        return state.scrollTop
      },
      set scrollTop(v: number) {
        state.scrollTop = v
      },
      _state: state,
    } as unknown as HTMLElement
  }

  it("cancels an in-flight ease when a new one starts", () => {
    vi.useFakeTimers()
    const raf = new Map<number, FrameRequestCallback>()
    let nextId = 0
    vi.stubGlobal("performance", { now: () => 0 })
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = ++nextId
      raf.set(id, cb)
      return id
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      raf.delete(id)
    })

    const container = mockScrollContainer(0, 300, 900)
    const first = { getBoundingClientRect: () => mockRect(220, 40) } as HTMLElement
    const second = { getBoundingClientRect: () => mockRect(420, 40) } as HTMLElement

    scrollLineToCenterEase(first, container, 200, { force: true })
    const firstStartTop = container.scrollTop

    scrollLineToCenterEase(second, container, 200, { force: true })
    const secondStartTop = container.scrollTop

    const firstCb = raf.values().next().value
    firstCb?.(50)
    expect(container.scrollTop).toBe(secondStartTop)

    const secondCb = [...raf.values()].at(-1)
    secondCb?.(100)
    expect(container.scrollTop).not.toBe(firstStartTop)

    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
