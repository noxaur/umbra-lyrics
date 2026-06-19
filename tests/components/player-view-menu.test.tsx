import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { PlayerViewMenu } from "@/components/player-view-menu"

function openViewMenu() {
  const trigger = screen.getByRole("button", { name: "View" })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false })
}

describe("PlayerViewMenu", () => {
  it("shows re-search lyrics when handler provided", () => {
    const onRefreshLyrics = vi.fn()
    render(<PlayerViewMenu onRefreshLyrics={onRefreshLyrics} />)

    openViewMenu()
    const item = screen.getByRole("menuitem", { name: "Re-search lyrics" })
    expect(item).not.toHaveAttribute("aria-disabled", "true")
    fireEvent.click(item)
    expect(onRefreshLyrics).toHaveBeenCalledTimes(1)
  })

  it("disables re-search while lyrics are loading", () => {
    render(<PlayerViewMenu onRefreshLyrics={vi.fn()} lyricsRefreshing />)

    openViewMenu()
    expect(screen.getByRole("menuitem", { name: "Searching for lyrics…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })
})
