import { describe, it, expect, beforeEach } from "vitest"
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_STORAGE_KEY,
  applyDisplaySettingsToElement,
  displaySettingsToCssVars,
  persistDisplaySettings,
  readStoredDisplaySettings,
} from "@/lib/display-settings"

describe("display-settings", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("maps presets to scaled css variables", () => {
    const vars = displaySettingsToCssVars({
      lyricsTextSize: "large",
      secondaryTextSize: "compact",
      uiTextSize: "default",
    })

    expect(vars["--lyrics-primary-size"]).toContain("clamp(")
    expect(vars["--lyrics-primary-size"]).toContain("1.495rem")
    expect(vars["--lyrics-secondary-size"]).toBe("0.7438rem")
    expect(vars["--lyrics-timestamp-size"]).toBe("0.6875rem")
  })

  it("persists and restores settings from localStorage", () => {
    persistDisplaySettings({
      lyricsTextSize: "comfortable",
      secondaryTextSize: "large",
      uiTextSize: "compact",
    })

    expect(readStoredDisplaySettings()).toEqual({
      lyricsTextSize: "comfortable",
      secondaryTextSize: "large",
      uiTextSize: "compact",
    })
  })

  it("falls back to defaults for invalid stored values", () => {
    localStorage.setItem(
      DISPLAY_SETTINGS_STORAGE_KEY,
      JSON.stringify({ lyricsTextSize: "huge", secondaryTextSize: null }),
    )

    expect(readStoredDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it("applies css variables to an element", () => {
    const element = document.createElement("div")
    applyDisplaySettingsToElement(element, {
      lyricsTextSize: "compact",
      secondaryTextSize: "default",
      uiTextSize: "large",
    })

    expect(element.style.getPropertyValue("--lyrics-primary-size")).toContain("0.9775rem")
    expect(element.style.getPropertyValue("--lyrics-placeholder-size")).toContain("1.625rem")
  })
})
