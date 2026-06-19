import { useEffect, useState } from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useMkvExport } from "@/hooks/use-mkv-export"
import { usePlayerStore } from "@/stores/player-store"
import type { MkvExportInput, MkvExportProgress } from "@/lib/mkv-export/types"

const PROGRESS_LABELS: Record<MkvExportProgress, string> = {
  idle: "",
  "loading-ffmpeg": "Loading ffmpeg (~30 MB, one-time)…",
  "fetching-media": "Fetching audio from YouTube…",
  muxing: "Muxing MKV with subtitles and chapters…",
  done: "Download started",
  error: "Export failed",
}

function buildExportInput(
  videoId: string,
  title: string,
  artist: string,
  track: string,
  durationSec: number,
  syncOffsetMs: number,
  languageCode: string,
  lyrics: MkvExportInput["native"]["lines"],
  englishLines: string[],
  includeEnglish: boolean,
  includeVideo: boolean,
): MkvExportInput {
  return {
    videoId,
    title,
    artist,
    track,
    durationMs: Math.max(0, durationSec * 1000),
    syncOffsetMs,
    native: { languageCode, lines: lyrics },
    english: englishLines.length > 0 ? { lines: englishLines } : undefined,
    includeVideo,
    includeEnglish: includeEnglish && englishLines.length > 0,
  }
}

type MkvExportDialogProps = {
  open: boolean
  durationSec: number
  onClose: () => void
}

export function MkvExportDialog({ open, durationSec, onClose }: MkvExportDialogProps) {
  const { progress, error, exportSong, cancel, reset, isExporting } = useMkvExport()
  const [includeEnglish, setIncludeEnglish] = useState(true)
  const [includeVideo, setIncludeVideo] = useState(false)

  const videoId = usePlayerStore((s) => s.videoId)
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  const track = usePlayerStore((s) => s.track)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const languageCode = usePlayerStore((s) => s.languageCode)
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const lyricsSynced = usePlayerStore((s) => s.lyricsSynced)
  const lyricsAutoTimed = usePlayerStore((s) => s.lyricsAutoTimed)

  useEffect(() => {
    if (!open) return
    reset()
    setIncludeEnglish(englishLines.length > 0)
    setIncludeVideo(false)
  }, [open, englishLines.length, reset])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isExporting) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, isExporting])

  if (!open) return null

  const input = buildExportInput(
    videoId ?? "",
    title,
    artist,
    track,
    durationSec,
    syncOffsetMs,
    languageCode,
    lyrics,
    englishLines,
    includeEnglish,
    includeVideo,
  )

  const handleExport = async () => {
    if (!videoId) return
    await exportSong(input)
  }

  const timingWarning = !lyricsSynced
    ? lyricsAutoTimed
      ? "Lyrics are auto-timed estimates. Adjust timing with ±0.5s before export if needed."
      : "Lyrics use approximate timing. Adjust with ±0.5s before export if needed."
    : null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mkv-export-title"
      onClick={isExporting ? undefined : onClose}
    >
      <div
        className="flex max-h-[min(92dvh,560px)] w-full max-w-md flex-col rounded-t-xl border border-border bg-background shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="mkv-export-title" className="text-lg font-semibold">
                Download MKV
              </h2>
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                Beta
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Downloads audio from YouTube and muxes synced subtitles plus section chapters in your
              browser.
            </p>
          </div>

          {timingWarning ? (
            <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              {timingWarning}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeEnglish}
                disabled={englishLines.length === 0 || isExporting}
                onChange={(e) => setIncludeEnglish(e.target.checked)}
                className="size-4 accent-primary"
              />
              <span>Include English subtitle track</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeVideo}
                disabled={isExporting}
                onChange={(e) => setIncludeVideo(e.target.checked)}
                className="size-4 accent-primary"
              />
              <span>Include video track (larger file)</span>
            </label>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            For personal use only. You are responsible for having rights to download this content.
          </p>

          {isExporting || progress === "done" ? (
            <div
              className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              {isExporting ? <LottieIcon name="loader" className="size-4" spin aria-hidden /> : null}
              <span>{PROGRESS_LABELS[progress]}</span>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {isExporting ? (
              <Button variant="outline" className="w-full sm:w-auto" onClick={cancel}>
                Cancel
              </Button>
            ) : (
              <>
                <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
                  Close
                </Button>
                <Button className="w-full sm:w-auto" onClick={handleExport} disabled={!videoId}>
                  <LottieIcon name="download" className="size-4" aria-hidden />
                  Export MKV
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

type MkvExportButtonProps = {
  durationSec: number
  className?: string
}

export function MkvExportButton({ durationSec, className }: MkvExportButtonProps) {
  const [open, setOpen] = useState(false)

  const status = usePlayerStore((s) => s.status)
  const lyrics = usePlayerStore((s) => s.lyrics)

  if (status !== "ready" || lyrics.length === 0) return null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("h-8 min-h-8 gap-1 px-1.5 text-[0.6875rem]", className)}
        onClick={() => setOpen(true)}
        aria-label="Download MKV with synced lyrics (beta)"
        title="Download MKV with synced lyrics (beta)"
      >
        <LottieIcon name="download" className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">MKV</span>
        <span className="rounded bg-violet-500/15 px-1 py-px text-[0.55rem] font-semibold uppercase leading-none text-violet-700 dark:text-violet-300">
          Beta
        </span>
      </Button>
      <MkvExportDialog open={open} durationSec={durationSec} onClose={() => setOpen(false)} />
    </>
  )
}
