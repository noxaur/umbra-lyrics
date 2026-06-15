import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { LyricLine } from "@/components/lyric-line"

describe("LyricLine", () => {
  it("renders accessible karaoke progress when active and synced", () => {
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
    expect(container.querySelector(".bg-clip-text")).toBeNull()
    expect(container.querySelector("[style*='clip-path']")).not.toBeNull()
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

  it("uses tiered active size classes based on line length", () => {
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
    const line = screen.getByRole("button", { name: "Big line" })
    const outerSpan = line.querySelector(".font-semibold")
    expect(outerSpan?.className).toContain("text-[clamp(1.25rem,5.5cqw,2.15rem)]")
  })

  it("shrinks font tier for long active lines", () => {
    const longText =
      "This is a very long lyric line that should use a smaller tier so it fits on screen without overflowing"
    render(
      <LyricLine
        text={longText}
        active
        distanceFromActive={0}
        synced
        progress={0}
        displayMode="native"
      />,
    )
    const line = screen.getByRole("button", { name: longText })
    const outerSpan = line.querySelector(".font-semibold")
    expect(outerSpan?.className).toContain("text-[clamp(0.9rem,3.6cqw,1.35rem)]")
  })

  it("shows LRC timestamp when enabled", () => {
    render(
      <LyricLine
        text="Sing this line"
        startMs={65_430}
        showTimestamp
        active={false}
        distanceFromActive={2}
        synced
        progress={0}
        displayMode="native"
      />,
    )
    expect(screen.getByText("01:05.43")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Seek to 01:05.43, Sing this line" })).toBeInTheDocument()
  })
})
