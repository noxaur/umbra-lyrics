import { useEffect } from "react"
import { Eye, EyeOff, HelpCircle, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { usePlayerStore } from "@/stores/player-store"
import { ShortcutsHelp } from "@/components/shortcuts-help"
import { isEnglish } from "@/lib/language-service"
import type { LyricDisplayMode } from "@/types/lyrics"

type TransportControlsProps = {
  duration: number
  currentTime: number
  isPlaying: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (seconds: number) => void
}

export function TransportControls({
  duration,
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
}: TransportControlsProps) {
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const adjustOffset = usePlayerStore((s) => s.adjustOffset)
  const videoHidden = usePlayerStore((s) => s.videoHidden)
  const setVideoHidden = usePlayerStore((s) => s.setVideoHidden)
  const displayMode = usePlayerStore((s) => s.displayMode)
  const setDisplayMode = usePlayerStore((s) => s.setDisplayMode)
  const languageCode = usePlayerStore((s) => s.languageCode)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const englishSource = usePlayerStore((s) => s.englishSource)

  const hasEnglish = englishLines.length > 0

  useEffect(() => {
    if (!hasEnglish && displayMode !== "native") {
      setDisplayMode("native")
    }
  }, [hasEnglish, displayMode, setDisplayMode])

  useEffect(() => {
    if (hasEnglish && englishSource === "translated" && displayMode === "native") {
      setDisplayMode("both")
    }
  }, [hasEnglish, englishSource, displayMode, setDisplayMode])

  const modes: { value: LyricDisplayMode; label: string; disabled?: boolean }[] = [
    { value: "native", label: "Native" },
    { value: "english", label: "English", disabled: !hasEnglish },
    { value: "both", label: "Both", disabled: !hasEnglish },
  ]

  return (
    <div className="shrink-0 border-t border-border bg-card/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="min-h-[44px] flex-1 accent-primary"
            aria-label="Seek"
          />
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="default"
            size="icon"
            className="size-11 rounded-full"
            onClick={isPlaying ? onPause : onPlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <AnimatedIcon icon={isPlaying ? Pause : Play} active={isPlaying} />
          </Button>

          <fieldset className="flex items-center gap-0.5 border-0 p-0" aria-labelledby="lyrics-timing-label">
            <legend className="sr-only">Lyrics timing</legend>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={() => adjustOffset(-500)}
              aria-label="Lyrics 0.5 seconds earlier"
            >
              −0.5s
            </Button>
            <span
              className="min-w-10 text-center text-xs tabular-nums text-muted-foreground"
              id="lyrics-timing-label"
              aria-label={`Lyrics timing offset ${(syncOffsetMs / 1000).toFixed(1)} seconds`}
            >
              {(syncOffsetMs / 1000).toFixed(1)}s
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={() => adjustOffset(500)}
              aria-label="Lyrics 0.5 seconds later"
            >
              +0.5s
            </Button>
          </fieldset>

          {!isEnglish(languageCode) && (
            <select
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value as LyricDisplayMode)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="Lyric display mode"
              aria-describedby={!hasEnglish ? "bilingual-helper" : undefined}
            >
              {modes.map((m) => (
                <option key={m.value} value={m.value} disabled={m.disabled}>
                  {m.label}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setVideoHidden(!videoHidden)}
            aria-label={videoHidden ? "Show video" : "Hide video"}
            aria-pressed={videoHidden}
          >
            <AnimatedIcon icon={videoHidden ? Eye : EyeOff} />
          </Button>

          <ShortcutsHelp>
            <Button variant="ghost" size="icon" className="size-9" aria-label="Keyboard shortcuts">
              <HelpCircle className="size-4" />
            </Button>
          </ShortcutsHelp>
        </div>

        {!hasEnglish && !isEnglish(languageCode) && (
          <span id="bilingual-helper" className="text-center text-xs text-muted-foreground">
            No English lyrics found
          </span>
        )}
      </div>
    </div>
  )
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
