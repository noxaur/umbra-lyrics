import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
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
}

export function LyricsSourcePicker({ onSelectAlternate }: LyricsSourcePickerProps) {
  const lyricsSource = usePlayerStore((s) => s.lyricsSource)
  const lyricsAlternates = usePlayerStore((s) => s.lyricsAlternates)

  if (!lyricsSource || lyricsSource === "pasted" || lyricsSource === "translated" || lyricsAlternates.length === 0) {
    return null
  }

  const sourceLabel =
    LYRICS_PROVIDER_LABELS[lyricsSource as keyof typeof LYRICS_PROVIDER_LABELS] ?? lyricsSource
  const altCount = lyricsAlternates.length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 max-w-full gap-1 px-2 text-xs"
        >
          <span className="truncate">
            {sourceLabel} · {altCount} alt{altCount === 1 ? "" : "s"}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1rem))] p-0">
        <DropdownMenuLabel className="px-3 py-2 text-xs font-normal text-muted-foreground">
          Current source: {sourceLabel}
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
              className="h-auto min-h-[44px] flex-col items-start gap-0.5 px-3 py-2"
              onSelect={() => onSelectAlternate(alt)}
            >
              <span className="font-medium text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">
                {alt.trackName ?? "Unknown track"}
                {alt.artistName ? ` — ${alt.artistName}` : ""}
              </span>
              <span className="text-xs text-muted-foreground/80">{meta}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
