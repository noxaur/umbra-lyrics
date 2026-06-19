import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDown,
  ArrowUp,
  ListMusic,
  Loader2,
  Play,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatTrackLabel } from "@/lib/track-label"
import {
  clearSongQueue,
  moveQueueTrack,
  readSongQueue,
  removeTrackFromQueue,
  subscribeSongQueue,
  type QueueTrack,
} from "@/lib/song-queue"
import {
  readQueueSettings,
  setAutoApproveMetadata,
} from "@/lib/song-queue-settings"
import { usePlayerStore } from "@/stores/player-store"
import { cn } from "@/lib/utils"

const ICON_BTN = "size-8 min-h-8 min-w-8 shrink-0"

function statusLabel(status: QueueTrack["status"]): string {
  switch (status) {
    case "prefetching":
      return "Loading lyrics…"
    case "ready":
      return "Ready"
    case "error":
      return "Lyrics on play"
  }
}

export function QueueMenu({ className }: { className?: string }) {
  const navigate = useNavigate()
  const [queue, setQueue] = useState(() => readSongQueue())
  const [autoApprove, setAutoApprove] = useState(() => readQueueSettings().autoApproveMetadata)
  const queueContext = usePlayerStore((s) => s.queueContext)
  const setQueueContext = usePlayerStore((s) => s.setQueueContext)
  const currentVideoId = usePlayerStore((s) => s.videoId)

  useEffect(() => subscribeSongQueue(() => setQueue(readSongQueue())), [])

  const handlePlay = (index: number) => {
    const track = queue[index]
    if (!track) return
    setQueueContext({ trackIndex: index })
    navigate(`/play/${track.videoId}`, {
      state: { queueAutoPlay: true, queueContext: { trackIndex: index } },
    })
  }

  const handleRemove = (videoId: string) => {
    removeTrackFromQueue(videoId)
  }

  const handleClear = () => {
    clearSongQueue()
    if (queueContext) setQueueContext(null)
  }

  const handleAutoApproveChange = (checked: boolean) => {
    setAutoApprove(checked)
    setAutoApproveMetadata(checked)
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && setQueue(readSongQueue())}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("relative", ICON_BTN, className)}
          aria-label={`Queue${queue.length > 0 ? `, ${queue.length} songs` : ""}`}
          title="Playback queue"
        >
          <ListMusic className="size-3.5" aria-hidden />
          {queue.length > 0 ? (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.625rem] font-medium text-primary-foreground">
              {queue.length > 9 ? "9+" : queue.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Queue</span>
          {queue.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              {queue.length} {queue.length === 1 ? "song" : "songs"}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {queue.length === 0 ? (
          <DropdownMenuItem disabled>Queue is empty</DropdownMenuItem>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {queue.map((track, index) => {
              const isCurrent =
                (queueContext?.trackIndex === index && currentVideoId === track.videoId) ||
                (!queueContext && currentVideoId === track.videoId)
              return (
                <div
                  key={track.videoId}
                  className={cn(
                    "flex items-center gap-1 border-b border-border/50 px-2 py-1.5 last:border-b-0",
                    isCurrent && "bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => handlePlay(index)}
                  >
                    <span className="block truncate text-sm font-medium">
                      {formatTrackLabel(track)}
                    </span>
                    <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                      {track.status === "prefetching" ? (
                        <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />
                      ) : null}
                      {statusLabel(track.status)}
                      {isCurrent ? " · Now playing" : null}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => handlePlay(index)}
                    aria-label={`Play ${formatTrackLabel(track)}`}
                    title="Play now"
                  >
                    <Play className="size-3" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    disabled={index === 0}
                    onClick={() => moveQueueTrack(track.videoId, "up")}
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-3" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    disabled={index === queue.length - 1}
                    onClick={() => moveQueueTrack(track.videoId, "down")}
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-3" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => handleRemove(track.videoId)}
                    aria-label={`Remove ${formatTrackLabel(track)}`}
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={autoApprove}
          onCheckedChange={(checked) => handleAutoApproveChange(checked === true)}
          onSelect={(e) => e.preventDefault()}
        >
          Auto-approve title & artist
        </DropdownMenuCheckboxItem>
        {queue.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault()
                handleClear()
              }}
            >
              <X className="size-4" aria-hidden />
              Clear queue
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
