import { useEffect } from "react"
import { HelpCircle, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { formatDuration } from "@/lib/format-time"
import { usePlayerStore } from "@/stores/player-store"
import { ShortcutsHelp } from "@/components/shortcuts-help"
import { MkvExportButton } from "@/components/mkv-export-button"
import { PlayerViewMenu } from "@/components/player-view-menu"
import { getPlaylistById } from "@/lib/playlists"
import { isEnglish } from "@/lib/language-service"
import type { LyricDisplayMode } from "@/types/lyrics"

type TransportControlsProps = {
  duration: number
  currentTime: number
  isPlaying: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (seconds: number) => void
  onRefreshLyrics?: () => void
}

const ICON_BTN = "size-8 min-h-8 min-w-8 shrink-0"

export function TransportControls({
  duration,
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onRefreshLyrics,
}: TransportControlsProps) {
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const adjustOffset = usePlayerStore((s) => s.adjustOffset)
  const setSyncOffset = usePlayerStore((s) => s.setSyncOffset)
  const resetSyncOffset = usePlayerStore((s) => s.resetSyncOffset)
  const displayMode = usePlayerStore((s) => s.displayMode)
  const setDisplayMode = usePlayerStore((s) => s.setDisplayMode)
  const languageCode = usePlayerStore((s) => s.languageCode)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const romajiLines = usePlayerStore((s) => s.romajiLines)
  const englishStatus = usePlayerStore((s) => s.englishStatus)
  const englishSource = usePlayerStore((s) => s.englishSource)
  const lyricsFollowMode = usePlayerStore((s) => s.lyricsFollowMode)
  const requestLyricsScrollSync = usePlayerStore((s) => s.requestLyricsScrollSync)
  const status = usePlayerStore((s) => s.status)
  const playlistContext = usePlayerStore((s) => s.playlistContext)
  const goToNextPlaylistTrack = usePlayerStore((s) => s.goToNextPlaylistTrack)
  const goToPrevPlaylistTrack = usePlayerStore((s) => s.goToPrevPlaylistTrack)

  const playlist = playlistContext ? getPlaylistById(playlistContext.playlistId) : undefined
  const hasPrevTrack = playlistContext ? playlistContext.trackIndex > 0 : false
  const hasNextTrack = playlist
    ? playlistContext!.trackIndex < playlist.tracks.length - 1
    : false

  const lyricsRefreshing = status === "loading"

  const hasEnglish = englishLines.length > 0
  const hasRomaji = romajiLines.length > 0
  const englishLoading = englishStatus === "loading"
  const englishFailed = englishStatus === "failed"

  useEffect(() => {
    const needsEnglish =
      displayMode === "english" || displayMode === "both" || displayMode === "all"
    const needsRomaji =
      displayMode === "romaji" || displayMode === "native-romaji" || displayMode === "all"
    if (
      ((needsEnglish && !hasEnglish && !englishLoading && !englishFailed) ||
        (needsRomaji && !hasRomaji))
    ) {
      setDisplayMode("native")
    }
  }, [hasEnglish, hasRomaji, englishLoading, englishFailed, displayMode, setDisplayMode])

  useEffect(() => {
    if (hasEnglish && englishSource === "translated" && displayMode === "native") {
      setDisplayMode("both")
    }
  }, [hasEnglish, englishSource, displayMode, setDisplayMode])

  const modes: { value: LyricDisplayMode; label: string; disabled?: boolean }[] = [
    { value: "native", label: "Native" },
    {
      value: "romaji",
      label: "Romaji",
      disabled: !hasRomaji,
    },
    {
      value: "english",
      label: englishLoading ? "English…" : englishFailed ? "English (retry)" : "English",
      disabled: false,
    },
    {
      value: "native-romaji",
      label: "Native + Romaji",
      disabled: !hasRomaji,
    },
    {
      value: "both",
      label: englishLoading ? "Both…" : "Both",
      disabled: englishLoading,
    },
    {
      value: "all",
      label: "All",
      disabled: !hasRomaji || englishLoading,
    },
  ]

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-3xl flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="w-9 shrink-0 text-right text-[0.6875rem] tabular-nums text-muted-foreground">
            {formatDuration(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="h-4 min-h-8 flex-1 accent-primary"
            aria-label="Seek"
          />
          <span className="w-9 shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">
            {formatDuration(duration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <div className="flex items-center gap-1">
            {playlistContext ? (
              <Button
                variant="outline"
                size="icon"
                className={`${ICON_BTN} rounded-full`}
                onClick={goToPrevPlaylistTrack}
                disabled={!hasPrevTrack}
                aria-label="Previous track in playlist"
                title="Previous track (Shift+←)"
              >
                <SkipBack className="size-3.5" aria-hidden />
              </Button>
            ) : null}
            <Button
              variant="default"
              size="icon"
              className="size-9 min-h-9 min-w-9 shrink-0 rounded-full"
              onClick={isPlaying ? onPause : onPlay}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <AnimatedIcon icon={isPlaying ? Pause : Play} active={isPlaying} />
            </Button>
            {playlistContext ? (
              <Button
                variant="outline"
                size="icon"
                className={`${ICON_BTN} rounded-full`}
                onClick={goToNextPlaylistTrack}
                disabled={!hasNextTrack}
                aria-label="Next track in playlist"
                title="Next track (Shift+→)"
              >
                <SkipForward className="size-3.5" aria-hidden />
              </Button>
            ) : null}

            {lyricsFollowMode === "manual" ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 min-h-8 px-2 text-[0.6875rem] sm:hidden"
                onClick={() => requestLyricsScrollSync()}
              >
                Sync
              </Button>
            ) : null}

            {!isEnglish(languageCode) && (
              <select
                value={displayMode}
                onChange={(e) => setDisplayMode(e.target.value as LyricDisplayMode)}
                className="h-8 max-w-[6.5rem] min-h-8 truncate rounded-md border border-input bg-background px-1.5 text-[0.6875rem]"
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
          </div>

          <div
            className="flex min-w-[11rem] flex-1 items-center gap-0.5 border-l border-border/60 pl-1.5 sm:min-w-[14rem]"
            role="group"
            aria-labelledby="lyrics-timing-label"
          >
            <span id="lyrics-timing-label" className="sr-only">
              Lyrics timing
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-h-7 shrink-0 px-1 text-[0.625rem]"
              onClick={() => adjustOffset(-500)}
              aria-label="Lyrics 0.5 seconds earlier"
              title="Lyrics 0.5 seconds earlier"
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
              className="h-4 min-h-7 flex-1 accent-primary"
              aria-label={`Lyrics timing offset ${(syncOffsetMs / 1000).toFixed(1)} seconds`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-h-7 shrink-0 px-1 text-[0.625rem]"
              onClick={() => adjustOffset(500)}
              aria-label="Lyrics 0.5 seconds later"
              title="Lyrics 0.5 seconds later"
            >
              +0.5s
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 min-h-7 min-w-7 shrink-0"
              onClick={resetSyncOffset}
              aria-label="Reset lyrics timing"
              title="Reset timing"
            >
              <RotateCcw className="size-3" aria-hidden />
            </Button>
            <span
              className="w-8 shrink-0 text-right text-[0.625rem] tabular-nums text-muted-foreground"
              title="Lyrics timing offset"
            >
              {(syncOffsetMs / 1000).toFixed(1)}s
            </span>
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <PlayerViewMenu onRefreshLyrics={onRefreshLyrics} lyricsRefreshing={lyricsRefreshing} />
            <ShortcutsHelp>
              <Button variant="ghost" size="icon" className={ICON_BTN} aria-label="Keyboard shortcuts">
                <HelpCircle className="size-3.5" />
              </Button>
            </ShortcutsHelp>
            <MkvExportButton durationSec={duration} />
          </div>
        </div>

        {!hasEnglish && !isEnglish(languageCode) && (
          <span id="bilingual-helper" className="text-center text-[0.625rem] text-muted-foreground">
            {englishLoading
              ? "Fetching English lyrics…"
              : englishFailed
                ? "English unavailable — switch to English to retry"
                : englishSource === "translated"
                  ? "English via machine translation"
                  : "No English lyrics found"}
          </span>
        )}
      </div>
    </div>
  )
}
