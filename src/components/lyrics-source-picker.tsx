import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LYRICS_PROVIDER_LABELS, type LyricsAlternate } from "@/types/lyrics"
import { usePlayerStore } from "@/stores/player-store"

type LyricsSourcePickerProps = {
  onSelectAlternate: (alternate: LyricsAlternate) => void
}

export function LyricsSourcePicker({ onSelectAlternate }: LyricsSourcePickerProps) {
  const lyricsSource = usePlayerStore((s) => s.lyricsSource)
  const lyricsAlternates = usePlayerStore((s) => s.lyricsAlternates)
  const [open, setOpen] = useState(false)

  if (!lyricsSource || lyricsSource === "pasted" || lyricsSource === "translated" || lyricsAlternates.length === 0) {
    return null
  }

  const sourceLabel =
    LYRICS_PROVIDER_LABELS[lyricsSource as keyof typeof LYRICS_PROVIDER_LABELS] ?? lyricsSource
  const altCount = lyricsAlternates.length

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        Used {sourceLabel} ({altCount} alternative{altCount === 1 ? "" : "s"})
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </Button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close lyrics source menu"
            onClick={() => setOpen(false)}
          />
          <ul
            className="absolute right-0 top-full z-50 mt-1 min-w-[14rem] rounded-md border border-border bg-popover py-1 text-sm shadow-md"
            role="listbox"
            aria-label="Alternative lyrics sources"
          >
            <li className="px-3 py-1.5 text-xs text-muted-foreground" role="presentation">
              Current: {sourceLabel}
            </li>
            {lyricsAlternates.map((alt) => {
              const label = LYRICS_PROVIDER_LABELS[alt.providerId] ?? alt.providerId
              const meta = [alt.synced ? "synced" : "plain", `${alt.lineCount} lines`]
                .filter(Boolean)
                .join(" · ")
              return (
                <li key={`${alt.providerId}-${alt.id}`} role="option">
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      setOpen(false)
                      onSelectAlternate(alt)
                    }}
                  >
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {alt.trackName ?? "Unknown track"}
                      {alt.artistName ? ` — ${alt.artistName}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground/80">{meta}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </div>
  )
}
