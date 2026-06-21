import { createEvent, fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { resetTripleClickDetectionForTests, useTripleClick } from "@/hooks/use-triple-click"

function TripleClickProbe({ onTripleClick }: { onTripleClick: () => void }) {
  const handleClick = useTripleClick(onTripleClick)

  return (
    <a href="/home" onClick={handleClick}>
      tap
    </a>
  )
}

describe("useTripleClick", () => {
  beforeEach(() => {
    resetTripleClickDetectionForTests()
  })

  it("fires after three quick clicks", () => {
    const onTripleClick = vi.fn()
    const { getByRole } = render(<TripleClickProbe onTripleClick={onTripleClick} />)
    const link = getByRole("link", { name: "tap" })

    fireEvent.click(link)
    fireEvent.click(link)
    expect(onTripleClick).not.toHaveBeenCalled()

    fireEvent.click(link)
    expect(onTripleClick).toHaveBeenCalledTimes(1)
  })

  it("prevents default on the triggering click", () => {
    const onTripleClick = vi.fn()
    const { getByRole } = render(<TripleClickProbe onTripleClick={onTripleClick} />)
    const link = getByRole("link", { name: "tap" })

    fireEvent.click(link)
    fireEvent.click(link)

    const event = createEvent.click(link)
    fireEvent(link, event)

    expect(event.defaultPrevented).toBe(true)
    expect(onTripleClick).toHaveBeenCalledTimes(1)
  })

  it("keeps counting across probe remounts", () => {
    const onTripleClick = vi.fn()
    const { getByRole, unmount } = render(<TripleClickProbe onTripleClick={onTripleClick} />)

    fireEvent.click(getByRole("link", { name: "tap" }))
    unmount()

    const { getByRole: getRemountedRole } = render(<TripleClickProbe onTripleClick={onTripleClick} />)
    const remountedLink = getRemountedRole("link", { name: "tap" })

    fireEvent.click(remountedLink)
    fireEvent.click(remountedLink)

    expect(onTripleClick).toHaveBeenCalledTimes(1)
  })
})
