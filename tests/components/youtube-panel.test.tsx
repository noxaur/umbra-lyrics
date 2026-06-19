import { createRef } from "react"
import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { YouTubePanel } from "@/components/youtube-panel"

describe("YouTubePanel", () => {
  it("keeps a minimal footprint when hidden", () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(<YouTubePanel containerRef={ref} hidden />)

    const panel = container.firstChild as HTMLElement
    expect(panel).toHaveClass("h-[180px]", "w-[320px]", "opacity-0")
    expect(panel).not.toHaveClass("h-0", "h-px", "w-px")
    expect(panel).toHaveAttribute("aria-hidden", "true")
  })

  it("uses strip heights when compact", () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(<YouTubePanel containerRef={ref} hidden={false} compact />)

    const panel = container.firstChild as HTMLElement
    expect(panel).toHaveClass("h-[84px]", "sm:h-[120px]", "md:h-[140px]")
    expect(panel).not.toHaveClass("h-0")
  })

  it("uses split layout for mobile strip and desktop column", () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(
      <YouTubePanel containerRef={ref} hidden={false} layout="split" />,
    )

    const panel = container.firstChild as HTMLElement
    expect(panel).toHaveClass(
      "h-[84px]",
      "lg:aspect-video",
      "lg:h-full",
      "lg:max-h-full",
      "lg:flex-none",
    )
  })
})
