import { Link } from "react-router-dom"
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTrackLabel } from "@/lib/track-label"
import type { PlaylistTrack } from "@/lib/playlists"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"
import { cn } from "@/lib/utils"

type PlaylistTrackRowProps = {
  track: PlaylistTrack
  index?: number
  to?: string
  state?: unknown
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDragStart?: (index: number) => void
  onDragOver?: (index: number) => void
  onDrop?: (index: number) => void
  draggable?: boolean
  dragIndex?: number
  className?: string
}

export function PlaylistTrackRow({
  track,
  index,
  to,
  state,
  onRemove,
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
          <GripVertical className="size-4" />
        </span>
      ) : null}
      <img
        src={youtubeThumbnailUrl(track.videoId)}
        alt=""
        width={68}
        height={38}
        loading="lazy"
        decoding="async"
        className="h-[2.375rem] w-[4.25rem] shrink-0 rounded-md border border-border/60 bg-muted object-cover"
        aria-hidden
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

      {(onMoveUp || onMoveDown || onRemove) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {onMoveUp ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onMoveUp}
              aria-label="Move track up"
            >
              <ChevronUp className="size-4" aria-hidden />
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
              <ChevronDown className="size-4" aria-hidden />
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
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
