import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, it, expect } from "vitest"
import { AppShell } from "@/components/app-shell"
import { ThemeProvider } from "@/components/theme-provider"

function renderShell(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

describe("AppShell", () => {
  it("locks the viewport when requested", () => {
    renderShell(
      <AppShell viewportLock>
        <p>Player content</p>
      </AppShell>,
    )

    const main = screen.getByRole("main")
    expect(main).toHaveClass("overflow-hidden")
    expect(main).not.toHaveClass("overflow-y-auto")
  })

  it("allows main to scroll on regular pages", () => {
    renderShell(
      <AppShell>
        <p>Home content</p>
      </AppShell>,
    )

    const main = screen.getByRole("main")
    expect(main).toHaveClass("overflow-y-auto")
  })
})
