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
  it("uses React Router Link for brand navigation", () => {
    renderShell(
      <AppShell>
        <div>content</div>
      </AppShell>,
    )

    const brand = screen.getByRole("link", { name: "song-kara" })
    expect(brand).toHaveAttribute("href", "/")
    expect(brand.tagName).toBe("A")
  })

  it("links to playlists page from header", () => {
    renderShell(
      <AppShell>
        <div>content</div>
      </AppShell>,
    )

    const playlistsLink = screen.getByRole("link", { name: "Playlists" })
    expect(playlistsLink).toHaveAttribute("href", "/playlists")
  })

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
