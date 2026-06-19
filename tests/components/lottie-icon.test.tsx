import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LottieIcon } from "@/components/icons/lottie-icon"

const goToAndStop = vi.fn()
const getDuration = vi.fn(() => 8)
const play = vi.fn()

vi.mock("lottie-react", () => ({
  default: ({
    onDOMLoaded,
    lottieRef,
  }: {
    onDOMLoaded?: () => void
    lottieRef?: { current: unknown }
  }) => {
    if (lottieRef) {
      lottieRef.current = {
        play,
        goToAndStop,
        getDuration,
      }
    }
    onDOMLoaded?.()
    return <div data-testid="lottie-mock" />
  },
}))

describe("LottieIcon", () => {
  it("forwards aria-label for standalone status icons", () => {
    render(<LottieIcon name="check-circle-2" aria-label="Already indexed" />)
    expect(screen.getByRole("img", { name: "Already indexed" })).toBeInTheDocument()
  })

  it("rests toggle icons on their end frame", () => {
    goToAndStop.mockClear()
    render(<LottieIcon name="pause" className="size-4" aria-hidden />)
    expect(goToAndStop).toHaveBeenCalledWith(7, true)
  })

  it("rests play icons on the first frame", () => {
    goToAndStop.mockClear()
    render(<LottieIcon name="play" className="size-4" aria-hidden />)
    expect(goToAndStop).toHaveBeenCalledWith(0, true)
  })
})
