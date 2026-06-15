import { createRef } from "react"
import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { YouTubePanel } from "@/components/youtube-panel"

describe("YouTubePanel", () => {
  it("collapses when hidden", () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(<YouTubePanel containerRef={ref} hidden />)

    const panel = container.firstChild as HTMLElement
    expect(panel).toHaveClass("h-0", "opacity-0")
    expect(panel).toHaveAttribute("aria-hidden", "true")
  })

  it("uses compact heights when visible", () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(<YouTubePanel containerRef={ref} hidden={false} compact />)

    const panel = container.firstChild as HTMLElement
    expect(panel).toHaveClass("lg:h-[180px]")
    expect(panel).not.toHaveClass("h-0")
  })
})
