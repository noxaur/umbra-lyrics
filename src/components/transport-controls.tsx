import { EyeOff, HelpCircle, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { usePlayerStore } from "@/stores/player-store"
import { ShortcutsHelp } from "@/components/shortcuts-help"
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

  const modes: { value: LyricDisplayMode; label: string }[] = [
    { value: "native", label: "Native" },
    { value: "english", label: "English" },
    { value: "both", label: "Both" },
  ]

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card/80 px-4 py-3 backdrop-blur-sm">
      <Button
        variant="outline"
        size="icon"
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <AnimatedIcon icon={isPlaying ? Pause : Play} active={isPlaying} />
      </Button>

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

      <span className="text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => adjustOffset(-500)} aria-label="Earlier lyrics">
          −0.5s
        </Button>
        <span className="min-w-12 text-center text-xs tabular-nums">
          {(syncOffsetMs / 1000).toFixed(1)}s
        </span>
        <Button variant="ghost" size="sm" onClick={() => adjustOffset(500)} aria-label="Later lyrics">
          +0.5s
        </Button>
      </div>

      {languageCode !== "eng" && (
        <select
          value={displayMode}
          onChange={(e) => setDisplayMode(e.target.value as LyricDisplayMode)}
          className="min-h-[44px] rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Lyric display mode"
        >
          {modes.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setVideoHidden(!videoHidden)}
        aria-label={videoHidden ? "Show video" : "Hide video"}
        aria-pressed={videoHidden}
      >
        <AnimatedIcon icon={EyeOff} />
      </Button>

      <ShortcutsHelp>
        <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts">
          <HelpCircle className="size-5" />
        </Button>
      </ShortcutsHelp>
    </div>
  )
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
