import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  LEGACY_THEME_STORAGE_KEY,
  THEME_CACHE_KEY,
  THEME_STORAGE_KEY,
  applyThemeToElement,
  buildThemeRegistry,
  cacheThemeForBootstrap,
  getThemeById,
  persistThemeId,
  readCachedTheme,
  readStoredThemeId,
  themeById,
  themes,
  tokensToCssVars,
} from "@/lib/themes"
import { saveCustomTheme } from "@/lib/custom-themes"

describe("themes", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("defines at least 18 named themes", () => {
    expect(themes.length).toBeGreaterThanOrEqual(18)
  })

  it("includes required dark and light defaults", () => {
    expect(themeById[DEFAULT_DARK_THEME_ID]).toBeDefined()
    expect(themeById[DEFAULT_LIGHT_THEME_ID]).toBeDefined()
    expect(themeById[DEFAULT_DARK_THEME_ID].category).toBe("dark")
    expect(themeById[DEFAULT_LIGHT_THEME_ID].category).toBe("light")
  })

  it("each theme has full karaoke token set", () => {
    for (const theme of themes) {
      expect(theme.tokens.karaokeActive).toMatch(/^oklch/)
      expect(theme.tokens.karaokeMuted).toMatch(/^oklch/)
      expect(theme.tokens.karaokeUnsung).toMatch(/^oklch/)
      expect(theme.tokens.karaokeStageBg).toMatch(/^oklch/)
    }
  })

  it("persists and reads theme id from localStorage", () => {
    persistThemeId("neon-tokyo", themeById["neon-tokyo"])
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("neon-tokyo")
    expect(readStoredThemeId()).toBe("neon-tokyo")
  })

  it("caches theme for bootstrap hydration", () => {
    const theme = themeById.vaporwave
    cacheThemeForBootstrap(theme)
    const cached = readCachedTheme()
    expect(cached?.id).toBe("vaporwave")
    expect(cached?.tokens.primary).toBe(theme.tokens.primary)
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeTruthy()
  })

  it("reads stored custom theme id from merged registry", () => {
    const { theme } = saveCustomTheme({
      name: "My custom",
      category: "dark",
      tokens: themeById.midnight.tokens,
    })
    persistThemeId(theme.id, theme)
    const registry = buildThemeRegistry([theme])
    expect(readStoredThemeId(registry)).toBe(theme.id)
  })

  it("migrates legacy dark/light storage keys", () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "light")
    expect(readStoredThemeId()).toBe(DEFAULT_LIGHT_THEME_ID)

    localStorage.clear()
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "dark")
    expect(readStoredThemeId()).toBe(DEFAULT_DARK_THEME_ID)
  })

  it("falls back to default dark for unknown stored id", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "not-a-real-theme")
    expect(readStoredThemeId()).toBe(DEFAULT_DARK_THEME_ID)
  })

  it("applyThemeToElement sets data-theme and css variables", () => {
    const el = document.createElement("div")
    const theme = getThemeById("vaporwave")
    applyThemeToElement(el, theme)

    expect(el.getAttribute("data-theme")).toBe("vaporwave")
    expect(el.classList.contains("dark")).toBe(true)
    expect(el.style.getPropertyValue("--primary")).toBe(theme.tokens.primary)
    expect(el.style.getPropertyValue("--karaoke-active-line")).toBe("")
    expect(el.style.getPropertyValue("--karaoke-highlight")).toBe("")
  })

  it("tokensToCssVars maps all token keys to css custom properties", () => {
    const vars = tokensToCssVars(themeById.midnight.tokens)
    expect(vars["--karaoke-active"]).toBe(themeById.midnight.tokens.karaokeActive)
    expect(vars["--background"]).toBe(themeById.midnight.tokens.background)
  })
})
