import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, beforeEach } from "vitest"
import { ThemePreviewCard } from "@/components/theme-preview-card"
import { ThemeProvider, useTheme } from "@/components/theme-provider"
import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  THEME_STORAGE_KEY,
  themeById,
} from "@/lib/themes"

function PreviewCardHarness({ themeId }: { themeId: string }) {
  const { setTheme } = useTheme()
  const theme = themeById[themeId]

  return <ThemePreviewCard theme={theme} selected={false} onSelect={setTheme} />
}

function renderThemeCard(themeId: string) {
  return render(
    <ThemeProvider defaultThemeId={DEFAULT_DARK_THEME_ID}>
      <PreviewCardHarness themeId={themeId} />
    </ThemeProvider>,
  )
}

describe("ThemeProvider preview", () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_DARK_THEME_ID)
  })

  it("previews theme on hover without persisting", () => {
    renderThemeCard(DEFAULT_LIGHT_THEME_ID)

    const card = screen.getByRole("button", { name: /gruvbox light, soft theme/i })
    const previewTarget = card.parentElement!
    fireEvent.pointerEnter(previewTarget)

    expect(document.documentElement.getAttribute("data-theme")).toBe(DEFAULT_LIGHT_THEME_ID)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(DEFAULT_DARK_THEME_ID)

    fireEvent.pointerLeave(previewTarget)

    expect(document.documentElement.getAttribute("data-theme")).toBe(DEFAULT_DARK_THEME_ID)
  })

  it("persists theme only after click", () => {
    renderThemeCard(DEFAULT_LIGHT_THEME_ID)

    const card = screen.getByRole("button", { name: /gruvbox light, soft theme/i })
    fireEvent.pointerEnter(card.parentElement!)
    fireEvent.click(card)

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(DEFAULT_LIGHT_THEME_ID)
    expect(document.documentElement.getAttribute("data-theme")).toBe(DEFAULT_LIGHT_THEME_ID)
  })
})
