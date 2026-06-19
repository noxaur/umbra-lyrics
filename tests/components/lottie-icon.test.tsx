import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import { LottieIcon } from "@/components/icons/lottie-icon"

const playMock = vi.fn()
const goToAndStopMock = vi.fn()

vi.mock("lottie-react", () => ({
  default: ({
    lottieRef,
    onMouseEnter,
    onMouseLeave,
  }: {
    lottieRef?: { current: { play: () => void; goToAndStop: (frame: number, isFrame: boolean) => void } | null }
    onMouseEnter?: () => void
    onMouseLeave?: () => void
  }) => {
    if (lottieRef) {
      lottieRef.current = {
        play: playMock,
        goToAndStop: goToAndStopMock,
      }
    }
    return (
      <div
        data-testid="lottie-mock"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    )
  },
}))

describe("LottieIcon", () => {
  beforeEach(() => {
    playMock.mockReset()
    goToAndStopMock.mockReset()
  })

  it("renders with aria-hidden by default", () => {
    const { container } = render(<LottieIcon name="home" className="size-5" />)
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
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
    render(<LottieIcon name="play" active />)
    expect(goToAndStopMock).toHaveBeenCalledWith(7, true)
  })
})
