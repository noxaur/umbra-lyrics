import { AlertTriangle, Flag, Languages, RefreshCw } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getLyricsCache } from "@/lib/lyrics-cache"
import { buildLyricsRejectionUrl } from "@/lib/lyrics-rejection-report"
import { usePlayerStore } from "@/stores/player-store"
import { LYRICS_PROVIDER_LABELS, type LyricsAlternate, type LyricsProviderId } from "@/types/lyrics"
import { LyricsSourcePicker } from "@/components/lyrics-source-picker"
import { AddToPlaylistMenu } from "@/components/add-to-playlist-menu"
import { getRecentSongs } from "@/lib/recent-songs"

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

const badgeTitles: Record<SyncBadge, string> = {
  Synced: "Lyrics are time-synced to the audio",
  "Auto-timed": "Auto-timed from plain lyrics — syllable-weighted estimate",
  Transcribed: "Transcribed from audio via speech recognition",
  Approximate: "Approximate timing — adjust with ±0.5s below",
  Plain: "Plain or loading lyrics",
}

const META_BADGE_CLASS =
  "shrink-0 cursor-default rounded-full px-1.5 py-px text-[0.6875rem] font-medium leading-tight"

const TOOLBAR_ICON_CLASS = "size-8 shrink-0 text-muted-foreground hover:text-foreground"

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
  onRefreshLyrics?: () => void
  translating?: boolean
  showTranslate?: boolean
}

export function NowPlayingHeader({
  onSelectAlternate,
  onTranslate,
  onRefreshLyrics,
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
  const lyricsAlternates = usePlayerStore((s) => s.lyricsAlternates)
  const lyricsProvidersSearched = usePlayerStore((s) => s.lyricsProvidersSearched)
  const lyricsAttempts = usePlayerStore((s) => s.lyricsAttempts)
  const englishSource = usePlayerStore((s) => s.englishSource)
  const translationBackend = usePlayerStore((s) => s.translationBackend)
  const englishLines = usePlayerStore((s) => s.englishLines)

  const videoId = usePlayerStore((s) => s.videoId)
  const lyricsRefreshing = status === "loading"
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
  const rejectionUrl = useMemo(() => {
    if (
      !videoId ||
      lyrics.length === 0 ||
      !lyricsSource ||
      lyricsSource === "pasted" ||
      lyricsSource === "translated"
    ) {
      return null
    }

    const cached = getLyricsCache(videoId)
    return buildLyricsRejectionUrl({
      videoId,
      title,
      artist,
      track,
      providerId: lyricsSource,
      synced: lyricsSynced,
      autoTimed: lyricsAutoTimed,
      aligned: lyricsAligned,
      currentLyrics:
        cached?.lyricsResult.providerId === lyricsSource ? cached.lyricsResult : undefined,
      displayedLines: lyrics.map((line) => line.text),
      alternates: lyricsAlternates,
      providersSearched: lyricsProvidersSearched,
      attempts: lyricsAttempts,
    })
  }, [
    artist,
    lyrics,
    lyricsAligned,
    lyricsAlternates,
    lyricsAttempts,
    lyricsAutoTimed,
    lyricsProvidersSearched,
    lyricsSource,
    lyricsSynced,
    title,
    track,
    videoId,
  ])

  const recentEnglish = useMemo(
    () => (videoId ? getRecentSongs().find((song) => song.videoId === videoId) : undefined),
    [videoId],
  )

  if (!displayTrack && !artist && status === "idle" && !videoId) return null

  return (
    <div className="shrink-0 border-b border-border px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1 leading-tight">
          <h1
            className="truncate text-sm font-semibold sm:text-[0.9375rem]"
            title={displayTrack || undefined}
          >
            {displayTrack || "Loading track…"}
          </h1>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {artist ? (
              <p className="min-w-0 truncate text-xs text-muted-foreground" title={artist}>
                {artist}
              </p>
            ) : status === "loading" ? (
              <p className="text-xs text-muted-foreground">Identifying artist…</p>
            ) : null}
            {(artist || status === "loading") && (badge || sourceLabel || englishSource === "translated" || (englishLines.length > 0 && englishLines.length !== lyrics.length)) ? (
              <span className="shrink-0 text-muted-foreground/35" aria-hidden>
                ·
              </span>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {badge ? (
                <span
                  className={`${META_BADGE_CLASS} ${badgeStyles[badge]}`}
                  role="status"
                  title={badgeTitles[badge]}
                >
                  {badge}
                </span>
              ) : null}
              {sourceLabel ? (
                <span
                  className={`${META_BADGE_CLASS} border border-border bg-muted/40 text-muted-foreground`}
                  role="status"
                  title={`Lyrics from ${sourceLabel}`}
                >
                  {sourceLabel}
                </span>
              ) : null}
              {englishSource === "translated" ? (
                <span
                  className={`${META_BADGE_CLASS} bg-sky-500/15 text-sky-700 dark:text-sky-300`}
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
                  className={`${META_BADGE_CLASS} bg-amber-500/15 text-amber-700 dark:text-amber-300`}
                  role="status"
                  title="English and native lyric line counts differ"
                >
                  Line mismatch
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {videoId ? (
            <AddToPlaylistMenu
              track={{
                videoId,
                title,
                artist,
                track,
                englishArtist: recentEnglish?.englishArtist,
                englishTrack: recentEnglish?.englishTrack,
              }}
              variant="ghost"
              size="icon"
              className={TOOLBAR_ICON_CLASS}
            />
          ) : null}
          {onRefreshLyrics && videoId ? (
            <Button
              variant="ghost"
              size="icon"
              className={TOOLBAR_ICON_CLASS}
              onClick={onRefreshLyrics}
              disabled={lyricsRefreshing}
              aria-label={lyricsRefreshing ? "Searching for lyrics" : "Re-search lyrics"}
              title="Re-parse title, search providers, and verify against audio"
            >
              <RefreshCw
                className={cn("size-4", lyricsRefreshing && "motion-safe:animate-spin")}
                aria-hidden
              />
            </Button>
          ) : null}
          {rejectionUrl ? (
            <Button asChild variant="ghost" size="icon" className={TOOLBAR_ICON_CLASS}>
              <a
                href={rejectionUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Reject lyrics"
                title="Report incorrect lyrics on GitHub"
              >
                <Flag className="size-4" aria-hidden />
              </a>
            </Button>
          ) : null}
          {showTranslate && onTranslate ? (
            <Button
              variant="ghost"
              size="icon"
              className={TOOLBAR_ICON_CLASS}
              onClick={onTranslate}
              disabled={translating}
              aria-label={translating ? "Translating lyrics" : "Translate lyrics"}
              title={translating ? "Translating…" : "Translate lyrics to English"}
            >
              <Languages className="size-4" aria-hidden />
            </Button>
          ) : null}
          {onSelectAlternate ? (
            <LyricsSourcePicker onSelectAlternate={onSelectAlternate} compact />
          ) : null}
        </div>
      </div>
      {timingNotice ? (
        <div
          className="mt-1 flex min-w-0 items-start gap-1.5 text-[0.6875rem] text-foreground/90 sm:text-xs"
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
