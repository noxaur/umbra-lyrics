import type { Theme, ThemeCategory, ThemeTokens } from "@/lib/themes"

export const CUSTOM_THEMES_STORAGE_KEY = "song-kara-custom-themes"
export const MAX_CUSTOM_THEMES = 10
export const CUSTOM_THEME_ID_PREFIX = "custom-"

export type CustomTheme = Theme & {
  isCustom: true
  createdAt: string
  updatedAt: string
}

export type CustomThemeInput = {
  name: string
  description?: string
  category: ThemeCategory
  tokens: ThemeTokens
}

function isCustomThemeRecord(value: unknown): value is CustomTheme {
  if (!value || typeof value !== "object") return false
  const t = value as Partial<CustomTheme>
  return (
    typeof t.id === "string" &&
    t.id.startsWith(CUSTOM_THEME_ID_PREFIX) &&
    typeof t.name === "string" &&
    (t.category === "dark" || t.category === "light") &&
    typeof t.tokens === "object" &&
    t.tokens !== null
  )
}

export function isCustomThemeId(id: string): boolean {
  return id.startsWith(CUSTOM_THEME_ID_PREFIX)
}

export function createCustomThemeId(): string {
  return `${CUSTOM_THEME_ID_PREFIX}${crypto.randomUUID()}`
}

export function readCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCustomThemeRecord)
  } catch {
    return []
  }
}

export function writeCustomThemes(themes: CustomTheme[]): void {
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes.slice(0, MAX_CUSTOM_THEMES)))
}

export function saveCustomTheme(
  input: CustomThemeInput,
  existingId?: string,
): { theme: CustomTheme; error?: string } {
  const themes = readCustomThemes()
  const now = new Date().toISOString()
  const id = existingId && isCustomThemeId(existingId) ? existingId : createCustomThemeId()
  const existingIndex = themes.findIndex((t) => t.id === id)

  if (existingIndex === -1 && themes.length >= MAX_CUSTOM_THEMES) {
    return { theme: themes[0], error: `Maximum ${MAX_CUSTOM_THEMES} custom themes reached` }
  }

  const theme: CustomTheme = {
    id,
    name: input.name.trim() || "Untitled theme",
    description: input.description?.trim() || "Your custom karaoke palette",
    category: input.category,
    tokens: input.tokens,
    isCustom: true,
    createdAt: existingIndex >= 0 ? themes[existingIndex].createdAt : now,
    updatedAt: now,
  }

  if (existingIndex >= 0) {
    themes[existingIndex] = theme
  } else {
    themes.unshift(theme)
  }

  writeCustomThemes(themes)
  return { theme }
}

export function deleteCustomTheme(id: string): void {
  if (!isCustomThemeId(id)) return
  writeCustomThemes(readCustomThemes().filter((t) => t.id !== id))
}

export function getCustomThemeById(id: string): CustomTheme | undefined {
  return readCustomThemes().find((t) => t.id === id)
}

export function exportCustomTheme(theme: CustomTheme): string {
  return JSON.stringify(
    {
      version: 1,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      tokens: theme.tokens,
    },
    null,
    2,
  )
}

export function importCustomTheme(json: string): { theme?: CustomTheme; error?: string } {
  try {
    const data = JSON.parse(json) as {
      name?: string
      description?: string
      category?: ThemeCategory
      tokens?: ThemeTokens
    }
    if (!data.tokens || typeof data.tokens !== "object") {
      return { error: "Invalid theme file: missing tokens" }
    }
    return saveCustomTheme({
      name: data.name ?? "Imported theme",
      description: data.description,
      category: data.category ?? inferCategory(data.tokens),
      tokens: data.tokens,
    })
  } catch {
    return { error: "Could not parse theme JSON" }
  }
}

export function inferCategory(tokens: ThemeTokens): ThemeCategory {
  const bg = tokens.background.match(/oklch\(\s*([\d.]+)/i)
  const lightness = bg ? Number.parseFloat(bg[1]) : 0.5
  return lightness < 0.55 ? "dark" : "light"
}
