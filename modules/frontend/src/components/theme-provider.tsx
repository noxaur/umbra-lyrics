import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  deleteCustomTheme,
  exportCustomTheme,
  importCustomTheme,
  readCustomThemes,
  saveCustomTheme,
  type CustomTheme,
  type CustomThemeInput,
} from "@/lib/custom-themes"
import {
  applyThemeToElement,
  bootstrapThemeFromStorage,
  buildThemeRegistry,
  cacheThemeForBootstrap,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  getAllThemes,
  getThemeById,
  persistThemeId,
  presetThemes,
  readStoredThemeId,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/themes"

type ThemeProviderState = {
  themeId: string
  theme: Theme
  themes: Theme[]
  presetThemes: Theme[]
  customThemes: CustomTheme[]
  setTheme: (id: string) => void
  previewTheme: (id: string) => void
  clearThemePreview: (id?: string) => void
  setLightTheme: () => void
  setDarkTheme: () => void
  saveCustomTheme: (input: CustomThemeInput, existingId?: string) => { theme: CustomTheme; error?: string }
  deleteCustomTheme: (id: string) => void
  exportCustomTheme: (theme: CustomTheme) => string
  importCustomTheme: (json: string) => { theme?: CustomTheme; error?: string }
  refreshCustomThemes: () => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultThemeId = DEFAULT_DARK_THEME_ID,
}: {
  children: React.ReactNode
  defaultThemeId?: string
}) {
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() => {
    try {
      return readCustomThemes()
    } catch {
      return []
    }
  })

  const registry = useMemo(() => buildThemeRegistry(customThemes), [customThemes])
  const allThemes = useMemo(() => getAllThemes(customThemes), [customThemes])

  const [themeId, setThemeIdState] = useState<string>(() => {
    try {
      return readStoredThemeId(registry)
    } catch {
      return defaultThemeId
    }
  })

  const theme = getThemeById(themeId, registry)
  const previewThemeIdRef = useRef<string | null>(null)

  useEffect(() => {
    bootstrapThemeFromStorage()
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (!stored || registry[stored]) return

    const fallback = getThemeById(defaultThemeId, registry)
    persistThemeId(fallback.id, fallback)
    setThemeIdState(fallback.id)
  }, [defaultThemeId, registry])

  useEffect(() => {
    previewThemeIdRef.current = null
    applyThemeToElement(document.documentElement, theme)
    cacheThemeForBootstrap(theme)
  }, [theme])

  const refreshCustomThemes = useCallback(() => {
    setCustomThemes(readCustomThemes())
  }, [])

  const setTheme = useCallback(
    (id: string) => {
      const next = registry[id]
      if (!next) return
      previewThemeIdRef.current = null
      persistThemeId(id, next)
      setThemeIdState(id)
    },
    [registry],
  )

  const previewTheme = useCallback(
    (id: string) => {
      const next = registry[id]
      if (!next) return
      previewThemeIdRef.current = id
      applyThemeToElement(document.documentElement, next)
    },
    [registry],
  )

  const clearThemePreview = useCallback(
    (id?: string) => {
      if (id !== undefined && previewThemeIdRef.current !== id) return
      if (previewThemeIdRef.current === null) return
      previewThemeIdRef.current = null
      applyThemeToElement(document.documentElement, theme)
    },
    [theme],
  )

  const setLightTheme = () => setTheme(DEFAULT_LIGHT_THEME_ID)
  const setDarkTheme = () => setTheme(DEFAULT_DARK_THEME_ID)

  const handleSaveCustomTheme = useCallback(
    (input: CustomThemeInput, existingId?: string) => {
      const result = saveCustomTheme(input, existingId)
      if (!result.error) {
        setCustomThemes(readCustomThemes())
        persistThemeId(result.theme.id, result.theme)
        setThemeIdState(result.theme.id)
      }
      return result
    },
    [],
  )

  const handleDeleteCustomTheme = useCallback(
    (id: string) => {
      deleteCustomTheme(id)
      const remaining = readCustomThemes()
      setCustomThemes(remaining)
      if (themeId === id) {
        const fallback = getThemeById(DEFAULT_DARK_THEME_ID, buildThemeRegistry(remaining))
        persistThemeId(fallback.id, fallback)
        setThemeIdState(fallback.id)
      }
    },
    [themeId],
  )

  const handleImportCustomTheme = useCallback((json: string) => {
    const result = importCustomTheme(json)
    if (result.theme) {
      setCustomThemes(readCustomThemes())
      persistThemeId(result.theme.id, result.theme)
      setThemeIdState(result.theme.id)
    }
    return result
  }, [])

  return (
    <ThemeProviderContext.Provider
      value={{
        themeId,
        theme,
        themes: allThemes,
        presetThemes,
        customThemes,
        setTheme,
        previewTheme,
        clearThemePreview,
        setLightTheme,
        setDarkTheme,
        saveCustomTheme: handleSaveCustomTheme,
        deleteCustomTheme: handleDeleteCustomTheme,
        exportCustomTheme,
        importCustomTheme: handleImportCustomTheme,
        refreshCustomThemes,
      }}
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

export function useThemePreviewHandlers(id: string) {
  const { previewTheme, clearThemePreview } = useTheme()

  return useMemo(
    () => ({
      onPointerEnter: () => previewTheme(id),
      onPointerLeave: () => clearThemePreview(id),
    }),
    [clearThemePreview, id, previewTheme],
  )
}

export function useThemePreviewEnter(id: string) {
  const { previewTheme } = useTheme()

  return useMemo(() => ({ onPointerEnter: () => previewTheme(id) }), [id, previewTheme])
}
