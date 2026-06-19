import { describe, it, expect, beforeEach } from "vitest"
import {
  CUSTOM_THEMES_STORAGE_KEY,
  MAX_CUSTOM_THEMES,
  createCustomThemeId,
  deleteCustomTheme,
  exportCustomTheme,
  importCustomTheme,
  isCustomThemeId,
  readCustomThemes,
  saveCustomTheme,
} from "@/lib/custom-themes"
import { DEFAULT_DARK_THEME_ID, themeById } from "@/lib/themes"

const sampleInput = {
  name: "Test Stage",
  description: "A test palette",
  category: "dark" as const,
  tokens: themeById[DEFAULT_DARK_THEME_ID].tokens,
}

describe("custom themes", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("creates custom theme ids with prefix", () => {
    const id = createCustomThemeId()
    expect(isCustomThemeId(id)).toBe(true)
  })

  it("saves and reads custom themes from localStorage", () => {
    const { theme, error } = saveCustomTheme(sampleInput)
    expect(error).toBeUndefined()
    expect(theme.name).toBe("Test Stage")
    expect(readCustomThemes()).toHaveLength(1)
    expect(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)).toContain(theme.id)
  })

  it("updates existing custom theme by id", () => {
    const { theme } = saveCustomTheme(sampleInput)
    const updated = saveCustomTheme({ ...sampleInput, name: "Renamed" }, theme.id)
    expect(updated.theme.name).toBe("Renamed")
    expect(readCustomThemes()).toHaveLength(1)
  })

  it("deletes custom theme", () => {
    const { theme } = saveCustomTheme(sampleInput)
    deleteCustomTheme(theme.id)
    expect(readCustomThemes()).toHaveLength(0)
  })

  it("enforces max custom themes", () => {
    for (let i = 0; i < MAX_CUSTOM_THEMES; i++) {
      saveCustomTheme({ ...sampleInput, name: `Theme ${i}` })
    }
    const overflow = saveCustomTheme({ ...sampleInput, name: "One too many" })
    expect(overflow.error).toMatch(/Maximum/)
    expect(readCustomThemes()).toHaveLength(MAX_CUSTOM_THEMES)
  })

  it("exports and imports theme json", () => {
    const { theme } = saveCustomTheme(sampleInput)
    const json = exportCustomTheme(theme)
    localStorage.clear()
    const imported = importCustomTheme(json)
    expect(imported.error).toBeUndefined()
    expect(imported.theme?.name).toBe("Test Stage")
    expect(readCustomThemes()).toHaveLength(1)
  })
})
