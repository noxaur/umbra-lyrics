import { useCallback, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Download, RotateCcw, Upload } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { ThemeColorInput, BUILDER_TOKEN_FIELDS, type BuilderTokenKey } from "@/components/theme-color-input"
import { ThemePreviewMini } from "@/components/theme-preview-mini"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTheme } from "@/components/theme-provider"
import { getCustomThemeById, inferCategory } from "@/lib/custom-themes"
import { DEFAULT_DARK_THEME_ID, themeById, type ThemeTokens } from "@/lib/themes"

function cloneTokens(tokens: ThemeTokens): ThemeTokens {
  return { ...tokens }
}

export function ThemeBuilderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get("edit")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { saveCustomTheme, importCustomTheme, exportCustomTheme } = useTheme()

  const basePreset = themeById[DEFAULT_DARK_THEME_ID]

  const existing = editId ? getCustomThemeById(editId) : undefined

  const [name, setName] = useState(existing?.name ?? "My theme")
  const [tokens, setTokens] = useState<ThemeTokens>(() =>
    cloneTokens(existing?.tokens ?? basePreset.tokens),
  )
  const [status, setStatus] = useState<string | null>(null)

  const category = useMemo(() => inferCategory(tokens), [tokens])

  const updateToken = useCallback((key: BuilderTokenKey, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetToBasePreset = () => {
    setTokens(cloneTokens(basePreset.tokens))
    setStatus(`Reset to ${basePreset.name} palette`)
  }

  const handleSave = () => {
    const result = saveCustomTheme(
      {
        name,
        description: "Your custom karaoke palette",
        category,
        tokens,
      },
      existing?.id,
    )
    if (result.error) {
      setStatus(result.error)
      return
    }
    setStatus("Theme saved and applied")
    navigate("/themes", { replace: true })
  }

  const handleExport = () => {
    const blob = new Blob(
      [
        exportCustomTheme({
          id: existing?.id ?? "custom-export",
          name,
          description: "Your custom karaoke palette",
          category,
          tokens,
          isCustom: true,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ],
      { type: "application/json" },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${name.trim().toLowerCase().replace(/\s+/g, "-") || "theme"}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus("Theme exported")
  }

  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const result = importCustomTheme(text)
    if (result.error) {
      setStatus(result.error)
      return
    }
    if (result.theme) {
      setName(result.theme.name)
      setTokens(cloneTokens(result.theme.tokens))
      setStatus("Theme imported — save to keep changes")
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-8">
          <Link
            to="/themes"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to themes
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            {existing ? "Edit custom theme" : "Theme builder"}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Tune stage colors with a live karaoke preview. Saved themes appear in your gallery and
            persist across sessions.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
          <section className="space-y-6 rounded-lg border border-border bg-card p-5">
            <div className="space-y-2">
              <label htmlFor="theme-name" className="text-sm font-medium">
                Theme name
              </label>
              <Input
                id="theme-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My neon stage"
                maxLength={40}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {BUILDER_TOKEN_FIELDS.map(({ key, label }) => (
                <ThemeColorInput
                  key={key}
                  label={label}
                  value={tokens[key]}
                  onChange={(v) => updateToken(key, v)}
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={resetToBasePreset} className="gap-1.5">
                <RotateCcw className="size-4" aria-hidden />
                Reset to {basePreset.name}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <Upload className="size-4" aria-hidden />
                Import JSON
              </Button>
              <Button type="button" variant="outline" onClick={handleExport} className="gap-1.5">
                <Download className="size-4" aria-hidden />
                Export JSON
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportFile(file)
                  e.target.value = ""
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={handleSave}>
                {existing ? "Save changes" : "Save theme"}
              </Button>
              <span className="text-xs text-muted-foreground capitalize">{category} stage</span>
              {status && (
                <p className="text-sm text-muted-foreground" role="status">
                  {status}
                </p>
              )}
            </div>
          </section>

          <aside className="lg:sticky lg:top-6">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Live preview
            </h2>
            <ThemePreviewMini tokens={tokens} />
            <p className="mt-3 text-xs text-muted-foreground">
              Preview uses your token picks for lyrics, active-line highlight, and transport chrome.
            </p>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
