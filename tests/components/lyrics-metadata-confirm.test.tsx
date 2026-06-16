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
})
