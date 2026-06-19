export type TextSizePreset = "compact" | "default" | "comfortable" | "large"

export const TEXT_SIZE_PRESETS: TextSizePreset[] = [
  "compact",
  "default",
  "comfortable",
  "large",
]

export const TEXT_SIZE_LABELS: Record<TextSizePreset, string> = {
  compact: "Compact",
  default: "Default",
  comfortable: "Comfortable",
  large: "Large",
}

export const DISPLAY_SETTINGS_STORAGE_KEY = "song-kara-display-settings"

export type DisplaySettings = {
  lyricsTextSize: TextSizePreset
  secondaryTextSize: TextSizePreset
  uiTextSize: TextSizePreset
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  lyricsTextSize: "default",
  secondaryTextSize: "default",
  uiTextSize: "default",
}

const TEXT_SIZE_SCALE: Record<TextSizePreset, number> = {
  compact: 0.85,
  default: 1,
  comfortable: 1.15,
  large: 1.3,
}

type ClampTokens = {
  minRem: number
  vw: number
  maxRem: number
}

const LYRICS_PRIMARY_BASE: ClampTokens = { minRem: 1.15, vw: 3.2, maxRem: 2.25 }
const LYRICS_TV_PRIMARY_BASE: ClampTokens = { minRem: 1.75, vw: 4.5, maxRem: 3.25 }
const LYRICS_TV_PRIMARY_LG_BASE: ClampTokens = { minRem: 2.5, vw: 6, maxRem: 5 }
const LYRICS_SECONDARY_TV_BASE: ClampTokens = { minRem: 1, vw: 2, maxRem: 2 }
const LYRICS_PLACEHOLDER_BASE: ClampTokens = { minRem: 1.25, vw: 3, maxRem: 2.5 }

const SECONDARY_REM_BASE = 0.875
const SECTION_LABEL_REM_BASE = 0.7
const TIMESTAMP_REM_BASE = 0.6875
const TIMESTAMP_SM_REM_BASE = 0.75

function roundRem(value: number): string {
  const rounded = Math.round(value * 10000) / 10000
  return `${rounded}rem`
}

function scaleClamp(base: ClampTokens, scale: number): string {
  return `clamp(${roundRem(base.minRem * scale)}, ${Math.round(base.vw * scale * 10000) / 10000}vw, ${roundRem(base.maxRem * scale)})`
}

function scaleRem(baseRem: number, scale: number): string {
  return roundRem(baseRem * scale)
}

export function displaySettingsToCssVars(settings: DisplaySettings): Record<string, string> {
  const lyricsScale = TEXT_SIZE_SCALE[settings.lyricsTextSize]
  const secondaryScale = TEXT_SIZE_SCALE[settings.secondaryTextSize]
  const uiScale = TEXT_SIZE_SCALE[settings.uiTextSize]

  return {
    "--lyrics-primary-size": scaleClamp(LYRICS_PRIMARY_BASE, lyricsScale),
    "--lyrics-tv-primary-size": scaleClamp(LYRICS_TV_PRIMARY_BASE, lyricsScale),
    "--lyrics-tv-primary-lg-size": scaleClamp(LYRICS_TV_PRIMARY_LG_BASE, lyricsScale),
    "--lyrics-secondary-size": scaleRem(SECONDARY_REM_BASE, secondaryScale),
    "--lyrics-secondary-tv-size": scaleClamp(LYRICS_SECONDARY_TV_BASE, secondaryScale),
    "--lyrics-section-label-size": scaleRem(SECTION_LABEL_REM_BASE, uiScale),
    "--lyrics-timestamp-size": scaleRem(TIMESTAMP_REM_BASE, uiScale),
    "--lyrics-timestamp-sm-size": scaleRem(TIMESTAMP_SM_REM_BASE, uiScale),
    "--lyrics-placeholder-size": scaleClamp(LYRICS_PLACEHOLDER_BASE, uiScale),
  }
}

export function applyDisplaySettingsToElement(
  element: HTMLElement,
  settings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS,
): void {
  const vars = displaySettingsToCssVars(settings)
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value)
  }
}

export function readStoredDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_DISPLAY_SETTINGS

    const parsed = JSON.parse(raw) as Partial<DisplaySettings>
    return {
      lyricsTextSize: isTextSizePreset(parsed.lyricsTextSize)
        ? parsed.lyricsTextSize
        : DEFAULT_DISPLAY_SETTINGS.lyricsTextSize,
      secondaryTextSize: isTextSizePreset(parsed.secondaryTextSize)
        ? parsed.secondaryTextSize
        : DEFAULT_DISPLAY_SETTINGS.secondaryTextSize,
      uiTextSize: isTextSizePreset(parsed.uiTextSize)
        ? parsed.uiTextSize
        : DEFAULT_DISPLAY_SETTINGS.uiTextSize,
    }
  } catch {
    return DEFAULT_DISPLAY_SETTINGS
  }
}

export function persistDisplaySettings(settings: DisplaySettings): void {
  localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function bootstrapDisplaySettingsFromStorage(): void {
  applyDisplaySettingsToElement(document.documentElement, readStoredDisplaySettings())
}

function isTextSizePreset(value: unknown): value is TextSizePreset {
  return typeof value === "string" && TEXT_SIZE_PRESETS.includes(value as TextSizePreset)
}
