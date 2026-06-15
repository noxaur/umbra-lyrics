import { Check, Pencil, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import { ThemePreviewMini } from "@/components/theme-preview-mini"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isCustomThemeId } from "@/lib/custom-themes"
import type { Theme } from "@/lib/themes"

const SWATCH_KEYS = [
  "background",
  "primary",
  "accent",
  "karaokeActive",
  "karaokeStageBg",
] as const

type ThemePreviewCardProps = {
  theme: Theme
  selected: boolean
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
}

export function ThemePreviewCard({ theme, selected, onSelect, onDelete }: ThemePreviewCardProps) {
  const isCustom = isCustomThemeId(theme.id)

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-3 transition-colors",
        selected
          ? "border-primary bg-accent/30 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/10",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(theme.id)}
        aria-pressed={selected}
        aria-label={`${theme.name} theme${selected ? ", selected" : ""}`}
        className="flex flex-col gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
      >
        <ThemePreviewMini tokens={theme.tokens} />

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{theme.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{theme.description}</p>
          </div>
          {selected && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-3" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex gap-1" aria-hidden>
          {SWATCH_KEYS.map((key) => (
            <span
              key={key}
              className="size-3 rounded-full border border-border/50"
              style={{ background: theme.tokens[key] }}
            />
          ))}
        </div>
      </button>

      {isCustom && (
        <div className="flex gap-2 border-t border-border/60 pt-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1" asChild>
            <Link to={`/themes/build?edit=${theme.id}`} aria-label={`Edit ${theme.name}`}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Link>
          </Button>
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-destructive hover:text-destructive"
              onClick={() => onDelete(theme.id)}
              aria-label={`Delete ${theme.name}`}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
