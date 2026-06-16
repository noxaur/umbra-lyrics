import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePlayerStore } from "@/stores/player-store"
import { LYRICS_PROVIDER_LABELS, type LyricsAlternate, type LyricsProviderId } from "@/types/lyrics"
import { LyricsSourcePicker } from "@/components/lyrics-source-picker"

const TRANSLATION_BACKEND_LABELS: Record<string, string> = {
  browser: "Browser",
  libretranslate: "LibreTranslate",
  mymemory: "MyMemory",
  google: "Google",
}

type SyncBadge = "Synced" | "Auto-timed" | "Transcribed" | "Approximate" | "Plain"

function getSyncBadge(
  status: string,
  lyricsSynced: boolean,
  lyricsAutoTimed: boolean,
  lyricsAligned: boolean,
  lyricsCount: number,
  lyricsSource: ReturnType<typeof usePlayerStore.getState>["lyricsSource"],
): SyncBadge | null {
  if (status === "loading") return "Plain"
  if (status !== "ready" || lyricsCount === 0) return null
  if (lyricsSource === "transcription" || (lyricsAligned && lyricsSynced)) return "Transcribed"
  if (lyricsSynced) return "Synced"
  if (lyricsAutoTimed) return "Auto-timed"
  if (lyricsSource === "pasted") return "Approximate"
  return "Approximate"
}

function getSourceLabel(source: ReturnType<typeof usePlayerStore.getState>["lyricsSource"]): string | null {
  if (!source || source === "pasted" || source === "translated") return null
  return LYRICS_PROVIDER_LABELS[source as LyricsProviderId] ?? source
}

const badgeStyles: Record<SyncBadge, string> = {
  Synced: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "Auto-timed": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Transcribed: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  Approximate: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Plain: "bg-muted text-muted-foreground",
}

function getTimingNoticeText(
  autoTimed: boolean,
  lyricsSource: ReturnType<typeof usePlayerStore.getState>["lyricsSource"],
  lyricsAligned: boolean,
): { short: string; full: string } | null {
  if (lyricsSource === "transcription" || lyricsAligned) {
    return {
      short: "Transcribed from audio — timing may be approximate",
      full: "Lyrics transcribed from YouTube audio via speech recognition. Words may differ from official lyrics; use ±0.5s below to adjust.",
    }
  }
  if (autoTimed) {
    return {
      short: "Auto-timed estimate — use ±0.5s below",
      full: "Auto-timed from plain lyrics — syllable-weighted estimate. Use ±0.5s below to adjust.",
    }
  }
  return {
    short: "Approximate timing — use ±0.5s below",
    full: "No synced lyrics — approximate timing. Use ±0.5s below to adjust.",
  }
}

type NowPlayingHeaderProps = {
  onSelectAlternate?: (alternate: LyricsAlternate) => void
  onTranslate?: () => void
  translating?: boolean
  showTranslate?: boolean
}

export function NowPlayingHeader({
  onSelectAlternate,
  onTranslate,
  translating = false,
  showTranslate = false,
}: NowPlayingHeaderProps) {
  const track = usePlayerStore((s) => s.track)
  const artist = usePlayerStore((s) => s.artist)
  const title = usePlayerStore((s) => s.title)
  const status = usePlayerStore((s) => s.status)
  const lyricsSynced = usePlayerStore((s) => s.lyricsSynced)
  const lyricsAutoTimed = usePlayerStore((s) => s.lyricsAutoTimed)
  const lyricsAligned = usePlayerStore((s) => s.lyricsAligned)
  const lyricsSource = usePlayerStore((s) => s.lyricsSource)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const englishSource = usePlayerStore((s) => s.englishSource)
  const translationBackend = usePlayerStore((s) => s.translationBackend)
  const englishLines = usePlayerStore((s) => s.englishLines)

  const videoId = usePlayerStore((s) => s.videoId)
  const displayTrack = track || title
  const badge = getSyncBadge(
    status,
    lyricsSynced,
    lyricsAutoTimed,
    lyricsAligned,
    lyrics.length,
    lyricsSource,
  )
  const sourceLabel = getSourceLabel(lyricsSource)
  const showTimingNotice =
    status === "ready" &&
    lyrics.length > 0 &&
    (lyricsSource === "transcription" || lyricsAligned || !lyricsSynced)
  const timingNotice = showTimingNotice
    ? getTimingNoticeText(lyricsAutoTimed, lyricsSource, lyricsAligned)
    : null

  if (!displayTrack && !artist && status === "idle" && !videoId) return null

  return (
    <div className="shrink-0 border-b border-border px-4 py-2.5">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1
            className="line-clamp-2 text-base font-semibold leading-tight"
            title={displayTrack || undefined}
          >
            {displayTrack || "Loading track…"}
          </h1>
          {artist ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground" title={artist}>
              {artist}
            </p>
          ) : status === "loading" ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Identifying artist…</p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {showTranslate && onTranslate ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onTranslate}
              disabled={translating}
            >
              {translating ? "Translating…" : "Translate"}
            </Button>
          ) : null}
          {badge ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[badge]}`}
              role="status"
            >
              {badge}
            </span>
          ) : null}
          {sourceLabel ? (
            <span
              className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              role="status"
              title="Lyrics source"
            >
              {sourceLabel}
            </span>
          ) : null}
          {englishSource === "translated" ? (
            <span
              className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300"
              role="status"
              title={
                translationBackend
                  ? `Translated via ${TRANSLATION_BACKEND_LABELS[translationBackend] ?? translationBackend}`
                  : "Machine-translated English"
              }
            >
              Translated
            </span>
          ) : null}
          {englishLines.length > 0 && englishLines.length !== lyrics.length ? (
            <span
              className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
              role="status"
              title="English and native lyric line counts differ"
            >
              Line mismatch
            </span>
          ) : null}
          {onSelectAlternate ? <LyricsSourcePicker onSelectAlternate={onSelectAlternate} /> : null}
        </div>
      </div>
      {timingNotice ? (
        <div
          className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs text-foreground/90 sm:text-sm"
          role="status"
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-amber-600 sm:size-4 dark:text-amber-400"
            aria-hidden
          />
          <p className="min-w-0 truncate sm:whitespace-normal">
            <span className="sm:hidden">{timingNotice.short}</span>
            <span className="hidden sm:inline">{timingNotice.full}</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}
