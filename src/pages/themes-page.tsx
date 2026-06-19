import { Link } from "react-router-dom"
import { ArrowLeft, Moon, Palette, Sun } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { ThemePreviewCard } from "@/components/theme-preview-card"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { MAX_CUSTOM_THEMES } from "@/lib/custom-themes"
import { cn } from "@/lib/utils"

export function ThemesPage() {
  const {
    themeId,
    presetThemes,
    customThemes,
    setTheme,
    setDarkTheme,
    setLightTheme,
    deleteCustomTheme,
  } = useTheme()

  const darkThemes = presetThemes.filter((t) => t.category === "dark")
  const lightThemes = presetThemes.filter((t) => t.category === "light")

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-8">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back home
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-balance">Themes</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Pick a look for your karaoke stage. Each preview shows live lyrics, active-line
                highlighting, and transport chrome in that palette.
              </p>
            </div>
            <Button asChild className="gap-1.5 shrink-0">
              <Link to="/themes/build">
                <Palette className="size-4" aria-hidden />
                Build custom theme
              </Link>
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={setDarkTheme} className="gap-1.5">
              <Moon className="size-3.5" aria-hidden />
              Quick dark
            </Button>
            <Button variant="outline" size="sm" onClick={setLightTheme} className="gap-1.5">
              <Sun className="size-3.5" aria-hidden />
              Quick light
            </Button>
          </div>
        </div>

        <section className="mb-10">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Your themes
            </h2>
            <span className="text-xs text-muted-foreground">
              {customThemes.length} / {MAX_CUSTOM_THEMES} saved
            </span>
          </div>
          {customThemes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <Palette className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">No custom themes yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your own stage palette with the theme builder.
              </p>
              <Button asChild className="mt-4 gap-1.5">
                <Link to="/themes/build">Start building</Link>
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4",
                "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {customThemes.map((theme) => (
                <ThemePreviewCard
                  key={theme.id}
                  theme={theme}
                  selected={themeId === theme.id}
                  onSelect={setTheme}
                  onDelete={deleteCustomTheme}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            Dark stages
          </h2>
          <div
            className={cn(
              "grid gap-4",
              "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {darkThemes.map((theme) => (
              <ThemePreviewCard
                key={theme.id}
                theme={theme}
                selected={themeId === theme.id}
                onSelect={setTheme}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            Light stages
          </h2>
          <div
            className={cn(
              "grid gap-4",
              "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {lightThemes.map((theme) => (
              <ThemePreviewCard
                key={theme.id}
                theme={theme}
                selected={themeId === theme.id}
                onSelect={setTheme}
              />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
