import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  LEGACY_THEME_STORAGE_KEY,
  THEME_CACHE_KEY,
  THEME_CATALOG_VERSION,
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

  it("defines non-empty generated preset catalog", () => {
    expect(themes.length).toBeGreaterThan(0)
  })

  it("includes required dark and light defaults", () => {
    expect(themeById[DEFAULT_DARK_THEME_ID]).toBeDefined()
    expect(themeById[DEFAULT_LIGHT_THEME_ID]).toBeDefined()
    expect(themeById[DEFAULT_DARK_THEME_ID].category).toBe("dark")
    expect(themeById[DEFAULT_LIGHT_THEME_ID].category).toBe("light")
    expect(DEFAULT_DARK_THEME_ID).toBe("gruvbox-dark-hard")
    expect(DEFAULT_LIGHT_THEME_ID).toBe("gruvbox-light-soft")
  })

  it("each theme has full karaoke token set", () => {
    for (const theme of themes) {
      expect(theme.tokens.karaokeActive).toBeTruthy()
      expect(theme.tokens.karaokeMuted).toBeTruthy()
      expect(theme.tokens.karaokeUnsung).toBeTruthy()
      expect(theme.tokens.karaokeStageBg).toBeTruthy()
    }
  })

  it("persists and reads theme id from localStorage", () => {
    persistThemeId(DEFAULT_DARK_THEME_ID, themeById[DEFAULT_DARK_THEME_ID])
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(DEFAULT_DARK_THEME_ID)
    expect(readStoredThemeId()).toBe(DEFAULT_DARK_THEME_ID)
  })

  it("caches theme for bootstrap hydration", () => {
    const theme = themeById[DEFAULT_DARK_THEME_ID]
    cacheThemeForBootstrap(theme)
    const cached = readCachedTheme()
    expect(cached?.catalogVersion).toBe(THEME_CATALOG_VERSION)
    expect(cached?.id).toBe(DEFAULT_DARK_THEME_ID)
    expect(cached?.tokens.primary).toBe(theme.tokens.primary)
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeTruthy()
  })

  it("ignores stale bootstrap cache from prior catalog versions", () => {
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({
        catalogVersion: 1,
        id: "midnight",
        category: "dark",
        tokens: themeById[DEFAULT_DARK_THEME_ID].tokens,
      }),
    )
    expect(readCachedTheme()).toBeNull()
  })

  it("reads stored custom theme id from merged registry", () => {
    const { theme } = saveCustomTheme({
      name: "My custom",
      category: "dark",
      tokens: themeById[DEFAULT_DARK_THEME_ID].tokens,
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
    const theme = getThemeById(DEFAULT_DARK_THEME_ID)
    applyThemeToElement(el, theme)

    expect(el.getAttribute("data-theme")).toBe(DEFAULT_DARK_THEME_ID)
    expect(el.classList.contains("dark")).toBe(true)
    expect(el.style.getPropertyValue("--primary")).toBe(theme.tokens.primary)
    expect(el.style.getPropertyValue("--karaoke-active-line")).toBe("")
    expect(el.style.getPropertyValue("--karaoke-highlight")).toBe("")
  })

  it("tokensToCssVars maps all token keys to css custom properties", () => {
    const vars = tokensToCssVars(themeById[DEFAULT_DARK_THEME_ID].tokens)
    expect(vars["--karaoke-active"]).toBe(themeById[DEFAULT_DARK_THEME_ID].tokens.karaokeActive)
    expect(vars["--background"]).toBe(themeById[DEFAULT_DARK_THEME_ID].tokens.background)
  })

  it("keeps Gruvbox defaults with stable ids and readable token mapping", () => {
    const dark = themeById[DEFAULT_DARK_THEME_ID]
    const light = themeById[DEFAULT_LIGHT_THEME_ID]

    expect(dark.name.toLowerCase()).toContain("gruvbox")
    expect(light.name.toLowerCase()).toContain("gruvbox")
    expect(dark.tokens.background).toBeTruthy()
    expect(light.tokens.background).toBeTruthy()
    expect(dark.tokens.karaokeActive).not.toBe(dark.tokens.karaokeMuted)
    expect(light.tokens.karaokeActive).not.toBe(light.tokens.karaokeMuted)
  })
})
