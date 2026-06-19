import { Link } from "react-router-dom"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Button } from "@/components/ui/button"
import { getLyricsCache } from "@/lib/lyrics-cache"
import { isLyricsRejected } from "@/lib/lyrics-rejection"
import { getPlaylistIndexIssue } from "@/lib/playlist-index-issues"
import { formatTrackLabel } from "@/lib/track-label"
import type { PlaylistTrack } from "@/lib/playlists"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"
import { cn } from "@/lib/utils"

type PlaylistTrackRowProps = {
  track: PlaylistTrack
  playlistId?: string
  index?: number
  to?: string
  state?: unknown
  onRemove?: () => void
  onRejectLyrics?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDragStart?: (index: number) => void
  onDragOver?: (index: number) => void
  onDrop?: (index: number) => void
  draggable?: boolean
  dragIndex?: number
  className?: string
}

function lyricsStatusDot(videoId: string, playlistId?: string): {
  className: string
  label: string
} {
  if (isLyricsRejected(videoId)) {
    return { className: "bg-muted-foreground/70 ring-1 ring-muted-foreground/50", label: "Lyrics rejected" }
  }
  if (getLyricsCache(videoId)) {
    return { className: "bg-emerald-500", label: "Lyrics indexed" }
  }
  const issue = playlistId ? getPlaylistIndexIssue(videoId) : undefined
  if (issue) {
    return {
      className: issue.reason === "needs_metadata" ? "bg-amber-500" : "bg-destructive",
      label: issue.message,
    }
  }
  return { className: "bg-muted-foreground/40", label: "Lyrics not indexed" }
}

export function PlaylistTrackRow({
  track,
  playlistId,
  index,
  to,
  state,
  onRemove,
  onRejectLyrics,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  draggable = false,
  dragIndex,
  className,
}: PlaylistTrackRowProps) {
  const label = formatTrackLabel(track)
  const status = lyricsStatusDot(track.videoId, playlistId)
  const canRejectLyrics = onRejectLyrics && Boolean(getLyricsCache(track.videoId))

  const content = (
    <>
      {draggable && index != null ? (
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move"
            onDragStart?.(index)
          }}
          className="flex shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-hidden
        >
          <LottieIcon name="grip-vertical" className="size-4" />
        </span>
      ) : null}
      <span className="relative shrink-0">
        <img
          src={youtubeThumbnailUrl(track.videoId)}
          alt=""
          width={68}
          height={38}
          loading="lazy"
          decoding="async"
          className="h-[2.375rem] w-[4.25rem] rounded-md border border-border/60 bg-muted object-cover"
          aria-hidden
        />
        {track.mediaSource === "music.youtube" ? (
          <span
            className="absolute -bottom-1 -right-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
            title="Swapped to Music YouTube"
            aria-label="Swapped to Music YouTube"
          >
            <LottieIcon name="music-2" className="size-2.5" aria-hidden />
            Music
          </span>
        ) : null}
      </span>
      <span
        className={cn("size-2 shrink-0 rounded-full", status.className)}
        title={status.label}
        aria-label={status.label}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  )

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2.5",
        dragIndex === index && "bg-accent/50",
        className,
      )}
      onDragOver={
        draggable && index != null
          ? (e) => {
              e.preventDefault()
              onDragOver?.(index)
            }
          : undefined
      }
      onDrop={
        draggable && index != null
          ? (e) => {
              e.preventDefault()
              onDrop?.(index)
            }
          : undefined
      }
    >
      {to ? (
        <Link
          to={to}
          state={state}
          title={label}
          className="flex min-w-0 flex-1 items-center gap-3 text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {content}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">{content}</div>
      )}

      {(onMoveUp || onMoveDown || onRemove || canRejectLyrics) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {onMoveUp ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onMoveUp}
              aria-label="Move track up"
            >
              <LottieIcon name="chevron-up" className="size-4" aria-hidden />
            </Button>
          ) : null}
          {onMoveDown ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onMoveDown}
              aria-label="Move track down"
            >
              <LottieIcon name="chevron-down" className="size-4" aria-hidden />
            </Button>
          ) : null}
          {canRejectLyrics ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={onRejectLyrics}
              aria-label="Reject lyrics"
              title="Reject lyrics for this track"
            >
              <LottieIcon name="flag" className="size-4" aria-hidden />
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              onClick={onRemove}
              aria-label="Remove track from playlist"
            >
              <LottieIcon name="trash-2" className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
