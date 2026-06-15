import { useEffect } from "react"
import { Eye, EyeOff, Focus, HelpCircle, Monitor, Pause, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { usePlayerStore } from "@/stores/player-store"
import { ShortcutsHelp } from "@/components/shortcuts-help"
import { MkvExportButton } from "@/components/mkv-export-button"
import { isEnglish } from "@/lib/language-service"
import type { LyricDisplayMode } from "@/types/lyrics"

type TransportControlsProps = {
  duration: number
  currentTime: number
  isPlaying: boolean
  playbackHint?: string | null
  onPlay: () => void
  onPause: () => void
  onSeek: (seconds: number) => void
}

export function TransportControls({
  duration,
  currentTime,
  isPlaying,
  playbackHint,
  onPlay,
  onPause,
  onSeek,
}: TransportControlsProps) {
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const adjustOffset = usePlayerStore((s) => s.adjustOffset)
  const setSyncOffset = usePlayerStore((s) => s.setSyncOffset)
  const resetSyncOffset = usePlayerStore((s) => s.resetSyncOffset)
  const videoHidden = usePlayerStore((s) => s.videoHidden)
  const setVideoHidden = usePlayerStore((s) => s.setVideoHidden)
  const focusMode = usePlayerStore((s) => s.focusMode)
  const setFocusMode = usePlayerStore((s) => s.setFocusMode)
  const tvMode = usePlayerStore((s) => s.tvMode)
  const setTvMode = usePlayerStore((s) => s.setTvMode)
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

        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
          {playbackHint ? (
            <p className="w-full text-center text-xs text-muted-foreground" role="status">
              {playbackHint}
            </p>
          ) : null}
          <Button
            variant="default"
            size="icon"
            className="size-11 rounded-full"
            onClick={isPlaying ? onPause : onPlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <AnimatedIcon icon={isPlaying ? Pause : Play} active={isPlaying} />
          </Button>

          <fieldset className="flex min-w-0 flex-1 flex-col gap-1 border-0 p-0 sm:max-w-[220px]" aria-labelledby="lyrics-timing-label">
            <legend id="lyrics-timing-label" className="text-center text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Lyrics timing
            </legend>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-1.5 text-xs"
                onClick={() => adjustOffset(-500)}
                aria-label="Lyrics 0.5 seconds earlier"
              >
                −0.5s
              </Button>
              <input
                type="range"
                min={-5000}
                max={5000}
                step={100}
                value={syncOffsetMs}
                onChange={(e) => setSyncOffset(Number(e.target.value))}
                className="min-h-[36px] flex-1 accent-primary"
                aria-label={`Lyrics timing offset ${(syncOffsetMs / 1000).toFixed(1)} seconds`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-1.5 text-xs"
                onClick={() => adjustOffset(500)}
                aria-label="Lyrics 0.5 seconds later"
              >
                +0.5s
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={resetSyncOffset}
                aria-label="Reset lyrics timing"
                title="Reset timing"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
            <span className="text-center text-[0.65rem] tabular-nums text-muted-foreground">
              {(syncOffsetMs / 1000).toFixed(1)}s offset
            </span>
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
            onClick={() => setTvMode(!tvMode)}
            aria-label={tvMode ? "Disable TV mode" : "Enable TV mode"}
            aria-pressed={tvMode}
            title="TV mode"
          >
            <Monitor className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setFocusMode(!focusMode)}
            aria-label={focusMode ? "Exit focus mode" : "Focus mode"}
            aria-pressed={focusMode}
            title="Focus mode"
          >
            <Focus className="size-4" />
          </Button>

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

          <MkvExportButton durationSec={duration} />
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
