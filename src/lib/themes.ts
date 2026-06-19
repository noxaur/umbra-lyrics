import { generatedTintedThemes } from "@/lib/generated-tinted-themes"

export const THEME_STORAGE_KEY = "umbra-theme-id"
export const LEGACY_THEME_STORAGE_KEY = "umbra-theme"
export const THEME_CACHE_KEY = "umbra-theme-cache"
export const THEME_CATALOG_VERSION = 2

export type ThemeCategory = "dark" | "light"

export type ThemeTokens = {
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  border: string
  input: string
  ring: string
  karaokeActive: string
  karaokeMuted: string
  karaokeUnsung: string
  karaokeStageBg: string
}

export type Theme = {
  id: string
  name: string
  description: string
  category: ThemeCategory
  tokens: ThemeTokens
}

export type ThemeCache = {
  catalogVersion: number
  id: string
  category: ThemeCategory
  tokens: ThemeTokens
}

const TOKEN_CSS_MAP: Record<keyof ThemeTokens, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  input: "--input",
  ring: "--ring",
  karaokeActive: "--karaoke-active",
  karaokeMuted: "--karaoke-muted",
  karaokeUnsung: "--karaoke-unsung",
  karaokeStageBg: "--karaoke-stage-bg",
}

export const DEFAULT_DARK_THEME_ID = "gruvbox-dark-hard"
export const DEFAULT_LIGHT_THEME_ID = "gruvbox-light-soft"

export const themes: Theme[] = generatedTintedThemes
export const presetThemes = themes

export const themeById: Record<string, Theme> = Object.fromEntries(
  themes.map((theme) => [theme.id, theme]),
)

export function buildThemeRegistry(customThemes: Theme[]): Record<string, Theme> {
  return {
    ...themeById,
    ...Object.fromEntries(customThemes.map((theme) => [theme.id, theme])),
  }
}

export function getAllThemes(customThemes: Theme[]): Theme[] {
  return [...themes, ...customThemes]
}

export function getThemeById(id: string, registry: Record<string, Theme> = themeById): Theme {
  return registry[id] ?? themeById[DEFAULT_DARK_THEME_ID]
}

export function tokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, cssVar] of Object.entries(TOKEN_CSS_MAP) as [keyof ThemeTokens, string][]) {
    vars[cssVar] = tokens[key]
  }
  return vars
}

export function applyThemeToElement(element: HTMLElement, theme: Theme): void {
  element.setAttribute("data-theme", theme.id)
  element.classList.remove("light", "dark")
  element.classList.add(theme.category === "dark" ? "dark" : "light")

  for (const [key, cssVar] of Object.entries(TOKEN_CSS_MAP) as [keyof ThemeTokens, string][]) {
    element.style.setProperty(cssVar, theme.tokens[key])
  }
}

export function cacheThemeForBootstrap(theme: Theme): void {
  const payload: ThemeCache = {
    catalogVersion: THEME_CATALOG_VERSION,
    id: theme.id,
    category: theme.category,
    tokens: theme.tokens,
  }
  localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(payload))
}

export function readCachedTheme(): ThemeCache | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ThemeCache
    if (!parsed?.id || !parsed?.tokens) return null
    if (parsed.catalogVersion !== THEME_CATALOG_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function bootstrapThemeFromStorage(): void {
  const cached = readCachedTheme()
  if (!cached) return

  const el = document.documentElement
  el.setAttribute("data-theme", cached.id)
  el.classList.remove("light", "dark")
  el.classList.add(cached.category === "dark" ? "dark" : "light")

  for (const [key, cssVar] of Object.entries(TOKEN_CSS_MAP) as [keyof ThemeTokens, string][]) {
    if (cached.tokens[key]) el.style.setProperty(cssVar, cached.tokens[key])
  }
}

export function readStoredThemeId(registry: Record<string, Theme> = themeById): string {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored && registry[stored]) return stored

  const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
  if (legacy === "light") return DEFAULT_LIGHT_THEME_ID
  if (legacy === "dark" || legacy === "system") return DEFAULT_DARK_THEME_ID

  return DEFAULT_DARK_THEME_ID
}

export function persistThemeId(id: string, theme?: Theme): void {
  localStorage.setItem(THEME_STORAGE_KEY, id)
  localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
  if (theme) cacheThemeForBootstrap(theme)
}
