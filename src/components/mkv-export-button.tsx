import { useEffect, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isMkvExportEnabled, isMkvExportParamActive, setMkvExportOptIn } from "@/lib/beta-features"
import { useMkvExport } from "@/hooks/use-mkv-export"
import { usePlayerStore } from "@/stores/player-store"
import type { MkvExportProgress } from "@/lib/mkv-export/types"

const PROGRESS_LABELS: Record<MkvExportProgress, string> = {
  idle: "",
  "loading-ffmpeg": "Loading ffmpeg (~30 MB, one-time)…",
  "fetching-media": "Downloading audio…",
  muxing: "Muxing MKV with subtitles and chapters…",
  done: "Download started",
  error: "Export failed",
}

type MkvExportDialogProps = {
  open: boolean
  durationSec: number
  onClose: () => void
}

export function MkvExportDialog({ open, durationSec, onClose }: MkvExportDialogProps) {
  const { progress, error, exportSong, cancel, reset, isExporting } = useMkvExport()
  const [includeVideo, setIncludeVideo] = useState(false)
  const [includeEnglish, setIncludeEnglish] = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)

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
    setAcknowledged(false)
    reset()
    setIncludeEnglish(englishLines.length > 0)
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

  const handleExport = async () => {
    if (!videoId || !acknowledged) return

    await exportSong({
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
    })
  }

  const timingWarning = !lyricsSynced
    ? lyricsAutoTimed
      ? "Lyrics are auto-timed estimates. Adjust timing with ±0.5s before export if needed."
      : "Lyrics use approximate timing. Adjust with ±0.5s before export if needed."
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mkv-export-title"
      onClick={isExporting ? undefined : onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
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
            Export audio with synced subtitle tracks and section chapters for VLC, mpv, and other
            players.
          </p>
        </div>

        {timingWarning ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {timingWarning}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 text-sm">
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
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={isExporting}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="text-muted-foreground">
              I confirm this export is for personal use only and I have rights to download this
              content.
            </span>
          </label>
        </div>

        {isExporting || progress === "done" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            {isExporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            <span>{PROGRESS_LABELS[progress]}</span>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          {isExporting ? (
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={handleExport} disabled={!acknowledged || !videoId}>
                <Download className="size-4" aria-hidden />
                Export MKV
              </Button>
            </>
          )}
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
  const [showBetaToggle, setShowBetaToggle] = useState(isMkvExportParamActive())

  const status = usePlayerStore((s) => s.status)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const enabled = isMkvExportEnabled()

  if (!enabled) return null
  if (status !== "ready" || lyrics.length === 0) return null

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        {showBetaToggle ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              defaultChecked={isMkvExportEnabled()}
              onChange={(e) => {
                setMkvExportOptIn(e.target.checked)
                setShowBetaToggle(isMkvExportParamActive())
              }}
              className="size-3 accent-primary"
            />
            Keep beta export
          </label>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={() => setOpen(true)}
        >
          <Download className="size-3.5" aria-hidden />
          <span>MKV</span>
          <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[0.6rem] font-semibold uppercase text-violet-700 dark:text-violet-300">
            Beta
          </span>
        </Button>
      </div>
      <MkvExportDialog open={open} durationSec={durationSec} onClose={() => setOpen(false)} />
    </>
  )
}
