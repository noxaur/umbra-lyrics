import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppShell } from "@/components/app-shell"
import { ThemeProvider } from "@/components/theme-provider"
import { resetTripleClickDetectionForTests } from "@/hooks/use-triple-click"

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react")
  return {
    ...actual,
    useReducedMotion: () => true,
  }
})

function renderShell(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

describe("AppShell home monster easter egg", () => {
  beforeEach(() => {
    resetTripleClickDetectionForTests()
  })

  it("shows a monster overlay after triple-clicking the home brand link", () => {
    renderShell(
      <AppShell>
        <div>content</div>
      </AppShell>,
    )

    const brand = screen.getByRole("link", { name: "umbra" })

    fireEvent.click(brand)
    fireEvent.click(brand)
    expect(screen.queryByTestId("monster-easter-egg")).not.toBeInTheDocument()

    fireEvent.click(brand)

    expect(screen.getByTestId("monster-easter-egg")).toBeInTheDocument()
  })

  it("restarts the monster when triple-clicked again during playback", () => {
    vi.useFakeTimers()

    renderShell(
      <AppShell>
        <div>content</div>
      </AppShell>,
    )

    const brand = screen.getByRole("link", { name: "umbra" })

    fireEvent.click(brand)
    fireEvent.click(brand)
    fireEvent.click(brand)

    expect(screen.getByTestId("monster-easter-egg")).toBeInTheDocument()

    fireEvent.click(brand)
    fireEvent.click(brand)
    fireEvent.click(brand)

    expect(screen.getByTestId("monster-easter-egg")).toBeInTheDocument()

    vi.runAllTimers()
    vi.useRealTimers()
  })
})
