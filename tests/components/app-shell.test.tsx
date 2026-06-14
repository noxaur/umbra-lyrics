import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { ThemeProvider } from "@/components/theme-provider"

describe("AppShell", () => {
  it("uses React Router Link for brand navigation", () => {
    render(
      <MemoryRouter>
        <ThemeProvider defaultTheme="dark">
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
})
