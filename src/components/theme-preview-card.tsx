import { Check } from "lucide-react"
import { ThemePreviewMini } from "@/components/theme-preview-mini"
import { cn } from "@/lib/utils"
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
}

export function ThemePreviewCard({ theme, selected, onSelect }: ThemePreviewCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(theme.id)}
      aria-pressed={selected}
      aria-label={`${theme.name} theme${selected ? ", selected" : ""}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-primary bg-accent/30 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/10",
      )}
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
  )
}
