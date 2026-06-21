import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LyricsMetadataConfirm } from "@/components/lyrics-metadata-confirm"

describe("LyricsMetadataConfirm", () => {
  it("lets the user edit parsed artist and track before search", () => {
    const onConfirm = vi.fn()

    render(
      <LyricsMetadataConfirm
        artist="Wrong Artist"
        track="Wrong Track"
        onConfirm={onConfirm}
      />,
    )

    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Correct Artist" } })
    fireEvent.change(screen.getByLabelText("Track"), { target: { value: "Correct Track" } })
    fireEvent.click(screen.getByRole("button", { name: "Search lyrics" }))

    expect(onConfirm).toHaveBeenCalledWith("Correct Artist", "Correct Track")
  })

  it("disables search when track title is empty", () => {
    render(
      <LyricsMetadataConfirm artist="Artist" track="" onConfirm={vi.fn()} />,
    )

    expect(screen.getByRole("button", { name: "Search lyrics" })).toBeDisabled()
  })

  it("vertically centers content in the player lyrics column layout", () => {
    const { container } = render(
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ height: 400 }}>
        <LyricsMetadataConfirm artist="Artist" track="Track" onConfirm={vi.fn()} />
      </div>,
    )

    const region = container.querySelector("[role='region']") as HTMLElement
    const title = screen.getByText("Confirm song details")

    expect(region).toBeTruthy()
    expect(region.className).toContain("justify-center")

    const regionRect = region.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    const offset =
      titleRect.top + titleRect.height / 2 - (regionRect.top + regionRect.height / 2)

    expect(Math.abs(offset)).toBeLessThanOrEqual(48)
  })
})
