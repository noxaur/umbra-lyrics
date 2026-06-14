import { createContext, useContext, useEffect, useState } from "react"
import {
  applyThemeToElement,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  getThemeById,
  persistThemeId,
  readStoredThemeId,
  themeById,
  themes,
  type Theme,
} from "@/lib/themes"

type ThemeProviderState = {
  themeId: string
  theme: Theme
  themes: Theme[]
  setTheme: (id: string) => void
  setLightTheme: () => void
  setDarkTheme: () => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultThemeId = DEFAULT_DARK_THEME_ID,
}: {
  children: React.ReactNode
  defaultThemeId?: string
}) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    try {
      return readStoredThemeId()
    } catch {
      return defaultThemeId
    }
  })

  const theme = getThemeById(themeId)

  useEffect(() => {
    applyThemeToElement(document.documentElement, theme)
  }, [theme])

  const setTheme = (id: string) => {
    if (!themeById[id]) return
    persistThemeId(id)
    setThemeIdState(id)
  }

  const setLightTheme = () => setTheme(DEFAULT_LIGHT_THEME_ID)
  const setDarkTheme = () => setTheme(DEFAULT_DARK_THEME_ID)

  return (
    <ThemeProviderContext.Provider
      value={{ themeId, theme, themes, setTheme, setLightTheme, setDarkTheme }}
    >
      {children}
    </ThemeProviderContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeProviderContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
