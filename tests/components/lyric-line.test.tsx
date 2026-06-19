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
    expect(activeClass).toContain("lyrics-primary-size")
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
    const timestamp = screen.getByText("01:05.43")
    expect(timestamp.className).toContain("lyrics-timestamp-size")
    expect(timestamp.className).toContain("lyrics-timestamp-sm-size")
  })

  it("uses tv primary size classes without tailwind responsive prefixes", () => {
    render(
      <LyricLine
        text="TV line"
        active
        distanceFromCenter={0}
        synced
        progress={0}
        displayMode="native"
        tvMode
      />,
    )

    const primary = screen.getByRole("button", { name: "TV line" }).querySelector(".font-semibold")
    expect(primary?.className).toContain("lyrics-tv-primary-size")
    expect(primary?.className).toContain("lyrics-tv-primary-lg-size")
    // Utilities layer wins over component-layer line-height; keep leading in CSS.
    expect(primary?.className).not.toContain("leading-snug")
  })

  it("renders romaji-only lyrics", () => {
    render(
      <LyricLine
        text="ひかりのセカイへ"
        romajiText="hikari no sekai e"
        active={false}
        distanceFromCenter={0}
        synced
        progress={0}
        displayMode="romaji"
      />,
    )

    expect(screen.queryByText("ひかりのセカイへ")).not.toBeInTheDocument()
    expect(screen.getByText("hikari no sekai e")).toBeInTheDocument()
  })

  it("renders native, romaji, and English together", () => {
    render(
      <LyricLine
        text="ひかりのセカイへ"
        romajiText="hikari no sekai e"
        englishText="to the world of light"
        active={false}
        distanceFromCenter={0}
        synced
        progress={0}
        displayMode="all"
      />,
    )

    expect(screen.getByText("ひかりのセカイへ")).toBeInTheDocument()
    expect(screen.getByText("hikari no sekai e")).toBeInTheDocument()
    expect(screen.getByText("to the world of light")).toBeInTheDocument()
  })
})
