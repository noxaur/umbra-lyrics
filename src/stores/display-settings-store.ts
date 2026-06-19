import { create } from "zustand"
import {
  applyDisplaySettingsToElement,
  DEFAULT_DISPLAY_SETTINGS,
  persistDisplaySettings,
  readStoredDisplaySettings,
  type DisplaySettings,
  type TextSizePreset,
} from "@/lib/display-settings"

type DisplaySettingsState = DisplaySettings & {
  setLyricsTextSize: (size: TextSizePreset) => void
  setSecondaryTextSize: (size: TextSizePreset) => void
  setUiTextSize: (size: TextSizePreset) => void
  resetDisplaySettings: () => void
}

function commitSettings(settings: DisplaySettings) {
  persistDisplaySettings(settings)
  applyDisplaySettingsToElement(document.documentElement, settings)
}

export const useDisplaySettingsStore = create<DisplaySettingsState>((set) => {
  const initial = readStoredDisplaySettings()

  return {
    ...initial,
    setLyricsTextSize: (lyricsTextSize) =>
      set((state) => {
        const next = { ...state, lyricsTextSize }
        commitSettings(next)
        return next
      }),
    setSecondaryTextSize: (secondaryTextSize) =>
      set((state) => {
        const next = { ...state, secondaryTextSize }
        commitSettings(next)
        return next
      }),
    setUiTextSize: (uiTextSize) =>
      set((state) => {
        const next = { ...state, uiTextSize }
        commitSettings(next)
        return next
      }),
    resetDisplaySettings: () =>
      set(() => {
        commitSettings(DEFAULT_DISPLAY_SETTINGS)
        return { ...DEFAULT_DISPLAY_SETTINGS }
      }),
  }
})
