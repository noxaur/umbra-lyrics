import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { LottieIcon } from "@/components/icons/lottie-icon"

const playMock = vi.fn()
const goToAndStopMock = vi.fn()
const getDurationMock = vi.fn(() => 8)

vi.mock("lottie-react", () => ({
  default: ({
    lottieRef,
    onDOMLoaded,
  }: {
    lottieRef?: {
      current: {
        play: () => void
        goToAndStop: (frame: number, isFrame: boolean) => void
        getDuration: (inFrames?: boolean) => number
      } | null
    }
    onDOMLoaded?: () => void
  }) => {
    if (lottieRef) {
      lottieRef.current = {
        play: playMock,
        goToAndStop: goToAndStopMock,
        getDuration: getDurationMock,
      }
    }
    onDOMLoaded?.()
    return <div data-testid="lottie-mock" />
  },
}))

describe("LottieIcon", () => {
  beforeEach(() => {
    playMock.mockReset()
    goToAndStopMock.mockReset()
    getDurationMock.mockReturnValue(8)
  })

  it("renders with aria-hidden by default", () => {
    const { container } = render(<LottieIcon name="home" className="size-5" />)
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
  })

  it("forwards aria-label for standalone status icons", () => {
    render(<LottieIcon name="check-circle-2" aria-label="Already indexed" />)
    expect(screen.getByRole("img", { name: "Already indexed" })).toBeInTheDocument()
  })

  it("plays on hover when hover is enabled", () => {
    const { container } = render(<LottieIcon name="home" hover />)
    fireEvent.mouseEnter(container.firstElementChild!)
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it("skips hover animation when active is true", () => {
    const { container } = render(<LottieIcon name="play" hover active />)
    fireEvent.mouseEnter(container.firstElementChild!)
    expect(playMock).not.toHaveBeenCalled()
  })

  it("syncs play/pause toggle icons to the active frame", () => {
    goToAndStopMock.mockClear()
    render(<LottieIcon name="play" active />)
    expect(goToAndStopMock).toHaveBeenCalledWith(7, true)
  })

  it("rests close icons on the end frame", () => {
    goToAndStopMock.mockClear()
    render(<LottieIcon name="x" className="size-4" aria-hidden />)
    expect(goToAndStopMock).toHaveBeenCalledWith(7, true)
  })

  it("resolves lottie-react when default export is the module namespace", async () => {
    vi.resetModules()
    vi.doMock("lottie-react", () => {
      const LottieComponent = ({
        lottieRef,
        onDOMLoaded,
      }: {
        lottieRef?: { current: unknown }
        onDOMLoaded?: () => void
      }) => {
        onDOMLoaded?.()
        return <div data-testid="lottie-namespace-mock" />
      }
      return { default: LottieComponent, useLottie: vi.fn() }
    })

    const { LottieIcon: LottieIconFresh } = await import("@/components/icons/lottie-icon")
    render(<LottieIconFresh name="home" />)
    expect(screen.getByTestId("lottie-namespace-mock")).toBeInTheDocument()
  })
})
