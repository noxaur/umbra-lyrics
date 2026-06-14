import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { ThemeProvider } from "@/components/theme-provider"

describe("AppShell", () => {
  it("uses React Router Link for brand navigation", () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AppShell>
            <div>content</div>
          </AppShell>
        </ThemeProvider>
      </MemoryRouter>,
    )

    const brand = screen.getByRole("link", { name: "song-kara" })
    expect(brand).toHaveAttribute("href", "/")
    expect(brand.tagName).toBe("A")
  })

  it("links to themes page from header", () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AppShell>
            <div>content</div>
          </AppShell>
        </ThemeProvider>
      </MemoryRouter>,
    )

    const themesLink = screen.getByRole("link", { name: "Browse themes" })
    expect(themesLink).toHaveAttribute("href", "/themes")
  })
})
