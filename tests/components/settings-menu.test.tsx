import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, it, expect } from "vitest"
import { SettingsMenu } from "@/components/settings-menu"
import { ThemeProvider } from "@/components/theme-provider"
import { useDisplaySettingsStore } from "@/stores/display-settings-store"

function renderSettingsMenu() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SettingsMenu />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

function openSettingsMenu() {
  const trigger = screen.getByRole("button", { name: "Settings" })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false })
}

describe("SettingsMenu", () => {
  it("opens text size and theme sections", () => {
    renderSettingsMenu()
    openSettingsMenu()

    expect(screen.getByText("Text size")).toBeInTheDocument()
    expect(screen.getByText("Lyrics")).toBeInTheDocument()
    expect(screen.getByText("Theme")).toBeInTheDocument()
  })

  it("updates lyrics text size from the nested menu", () => {
    useDisplaySettingsStore.setState({
      lyricsTextSize: "default",
      secondaryTextSize: "default",
      uiTextSize: "default",
    })

    renderSettingsMenu()
    openSettingsMenu()

    const lyricsTrigger = screen.getByText("Lyrics")
    fireEvent.pointerEnter(lyricsTrigger)
    fireEvent.pointerMove(lyricsTrigger)
    fireEvent.click(lyricsTrigger)

    const largeOption = screen.getByRole("menuitemradio", { name: "Large" })
    fireEvent.click(largeOption)

    expect(useDisplaySettingsStore.getState().lyricsTextSize).toBe("large")
  })

  it("links to the themes page from the nested theme menu", () => {
    renderSettingsMenu()
    openSettingsMenu()

    const themeTrigger = screen.getByText("Theme")
    fireEvent.pointerEnter(themeTrigger)
    fireEvent.pointerMove(themeTrigger)
    fireEvent.click(themeTrigger)

    const browseLink = screen.getByRole("menuitem", { name: "Browse all themes" })
    expect(browseLink).toHaveAttribute("href", "/themes")
  })
})
