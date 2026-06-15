import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { LyricLine } from "@/components/lyric-line"

describe("LyricLine", () => {
  it("renders a single text node when active and synced", () => {
    const { container } = render(
      <LyricLine
        text="Hello world"
        active
        distanceFromActive={0}
        synced
        progress={0.5}
        displayMode="native"
      />,
    )
    expect(screen.getByRole("button", { name: "Hello world" })).toBeInTheDocument()
    expect(container.querySelectorAll("span").length).toBe(2)
    expect(screen.getAllByText("Hello world")).toHaveLength(1)
  })

  it("skips word-progress wipe when unsynced", () => {
    const { container } = render(
      <LyricLine
        text="Approximate line"
        active
        distanceFromActive={0}
        synced={false}
        progress={0.5}
        displayMode="native"
      />,
    )
    expect(screen.getByRole("button", { name: "Approximate line" })).toBeInTheDocument()
    expect(container.querySelector(".bg-clip-text")).toBeNull()
    expect(screen.getAllByText("Approximate line")).toHaveLength(1)
  })

  it("uses venue-scale classes on active lines", () => {
    render(
      <LyricLine
        text="Big line"
        active
        distanceFromActive={0}
        synced
        progress={0}
        displayMode="native"
      />,
    )
    const outerSpan = screen.getByText("Big line").parentElement
    expect(outerSpan?.className).toContain("lg:text-[clamp(5rem,5vw,7rem)]")
  })
})
