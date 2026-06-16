import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { LyricLine } from "@/components/lyric-line"

describe("LyricLine", () => {
  it("renders accessible karaoke progress when active and synced", () => {
    const { container } = render(
      <LyricLine
        text="Hello world"
        active
        distanceFromCenter={0}
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
        distanceFromCenter={0}
        synced={false}
        progress={0.5}
        displayMode="native"
      />,
    )
    expect(screen.getByRole("button", { name: "Approximate line" })).toBeInTheDocument()
    expect(container.querySelector(".bg-clip-text")).toBeNull()
    expect(screen.getAllByText("Approximate line")).toHaveLength(1)
  })

  it("uses one base font size for every line", () => {
    const { rerender } = render(
      <LyricLine
        text="Big line"
        active
        distanceFromCenter={0}
        synced
        progress={0}
        displayMode="native"
      />,
    )
    const activeClass = screen.getByRole("button", { name: "Big line" }).querySelector(".font-semibold")
      ?.className

    rerender(
      <LyricLine
        text="Small line"
        active={false}
        distanceFromCenter={2}
        synced
        progress={0}
        displayMode="native"
      />,
    )
    const inactiveClass = screen.getByRole("button", { name: "Small line" }).querySelector(".font-semibold")
      ?.className

    expect(activeClass).toBe(inactiveClass)
    expect(activeClass).toContain("clamp")
  })

  it("shows LRC timestamp when enabled", () => {
    render(
      <LyricLine
        text="Sing this line"
        startMs={65_430}
        showTimestamp
        active={false}
        distanceFromCenter={2}
        synced
        progress={0}
        displayMode="native"
      />,
    )
    expect(screen.getByText("01:05.43")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Seek to 01:05.43, Sing this line" })).toBeInTheDocument()
  })
})
