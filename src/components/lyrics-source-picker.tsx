import { Button } from "@/components/ui/button"
import { LottieIcon } from "@/components/icons/lottie-icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LYRICS_PROVIDER_LABELS, type LyricsAlternate } from "@/types/lyrics"
import { usePlayerStore } from "@/stores/player-store"

type LyricsSourcePickerProps = {
  onSelectAlternate: (alternate: LyricsAlternate) => void
  compact?: boolean
}

export function LyricsSourcePicker({ onSelectAlternate, compact = false }: LyricsSourcePickerProps) {
  const lyricsSource = usePlayerStore((s) => s.lyricsSource)
  const lyricsAlternates = usePlayerStore((s) => s.lyricsAlternates)

  if (!lyricsSource || lyricsSource === "pasted" || lyricsSource === "translated" || lyricsAlternates.length === 0) {
    return null
  }

  const sourceLabel =
    LYRICS_PROVIDER_LABELS[lyricsSource as keyof typeof LYRICS_PROVIDER_LABELS] ?? lyricsSource
  const altCount = lyricsAlternates.length
  const pickerTitle = `Using ${sourceLabel} — ${altCount} alternative${altCount === 1 ? "" : "s"} available`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={pickerTitle}
            title={pickerTitle}
          >
            <LottieIcon name="layers-2" className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
            Used {sourceLabel} ({altCount} alternative{altCount === 1 ? "" : "s"})
            <LottieIcon name="chevron-down" className="size-3 opacity-60" aria-hidden />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Current: {sourceLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {lyricsAlternates.map((alt) => {
          const label = LYRICS_PROVIDER_LABELS[alt.providerId] ?? alt.providerId
          const meta = [alt.synced ? "synced" : "plain", `${alt.lineCount} lines`]
            .filter(Boolean)
            .join(" · ")

          return (
            <DropdownMenuItem
              key={`${alt.providerId}-${alt.id}`}
              className="h-auto min-h-[44px] flex-col items-start gap-0.5 py-2"
              onSelect={() => onSelectAlternate(alt)}
            >
              <span className="font-medium text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">
                {alt.trackName ?? "Unknown track"}
                {alt.artistName ? ` — ${alt.artistName}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">{meta}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
