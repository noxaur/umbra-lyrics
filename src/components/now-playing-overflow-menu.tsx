import { useState } from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PlaylistFormDialog } from "@/components/playlist-form-dialog"
import { cn } from "@/lib/utils"
import {
  addTrackToPlaylist,
  createPlaylist,
  readPlaylists,
  type PlaylistTrack,
} from "@/lib/playlists"
import { LYRICS_PROVIDER_LABELS, type LyricsAlternate } from "@/types/lyrics"
import { usePlayerStore } from "@/stores/player-store"

type NowPlayingOverflowMenuProps = {
  track: Omit<PlaylistTrack, "addedAt"> | null
  onRefreshLyrics?: () => void
  lyricsRefreshing?: boolean
  onReportLyrics?: () => void
  showTranslate?: boolean
  onTranslate?: () => void
  translating?: boolean
  onSelectAlternate?: (alternate: LyricsAlternate) => void
  className?: string
}

export function NowPlayingOverflowMenu({
  track,
  onRefreshLyrics,
  lyricsRefreshing = false,
  onReportLyrics,
  showTranslate = false,
  onTranslate,
  translating = false,
  onSelectAlternate,
  className,
}: NowPlayingOverflowMenuProps) {
  const [playlists, setPlaylists] = useState(() => readPlaylists())
  const [createOpen, setCreateOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const lyricsSource = usePlayerStore((s) => s.lyricsSource)
  const lyricsAlternates = usePlayerStore((s) => s.lyricsAlternates)

  const refreshPlaylists = () => setPlaylists(readPlaylists())

  const handleAdd = (playlistId: string) => {
    if (!track) return
    const result = addTrackToPlaylist(playlistId, track)
    refreshPlaylists()
    if (result.error) {
      setFeedback(result.error)
    } else {
      const playlist = result.playlist
      setFeedback(playlist ? `Added to ${playlist.name}` : "Added to playlist")
    }
    window.setTimeout(() => setFeedback(null), 2500)
  }

  const handleCreate = (name: string) => {
    if (!track) return
    const created = createPlaylist(name)
    if (created.error) {
      setFeedback(created.error)
      setCreateOpen(false)
      return
    }
    addTrackToPlaylist(created.playlist.id, track)
    refreshPlaylists()
    setCreateOpen(false)
    setFeedback(`Added to ${created.playlist.name}`)
    window.setTimeout(() => setFeedback(null), 2500)
  }

  const showSourcePicker =
    onSelectAlternate &&
    lyricsSource &&
    lyricsSource !== "pasted" &&
    lyricsSource !== "translated" &&
    lyricsAlternates.length > 0

  const sourceLabel = lyricsSource
    ? LYRICS_PROVIDER_LABELS[lyricsSource as keyof typeof LYRICS_PROVIDER_LABELS] ?? lyricsSource
    : null

  const hasActions =
    track ||
    (onRefreshLyrics && track) ||
    onReportLyrics ||
    (showTranslate && onTranslate) ||
    showSourcePicker

  if (!hasActions) return null

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && refreshPlaylists()}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 min-h-8 min-w-8 shrink-0 text-muted-foreground hover:text-foreground", className)}
            aria-label="More track actions"
            title="More actions"
          >
            <LottieIcon name="more-horizontal" className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {track ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LottieIcon name="list-music" className="size-4" aria-hidden />
                Add to playlist
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuLabel>Add to playlist</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {playlists.length === 0 ? (
                  <DropdownMenuItem disabled>No playlists yet</DropdownMenuItem>
                ) : (
                  playlists.map((playlist) => (
                    <DropdownMenuItem
                      key={playlist.id}
                      onSelect={(e) => {
                        e.preventDefault()
                        handleAdd(playlist.id)
                      }}
                    >
                      <span className="truncate">{playlist.name}</span>
                      <span className="ml-auto pl-2 text-xs text-muted-foreground">
                        {playlist.tracks.length}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    setCreateOpen(true)
                  }}
                >
                  <LottieIcon name="plus" className="size-4" aria-hidden />
                  New playlist
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {onRefreshLyrics && track ? (
            <DropdownMenuItem
              disabled={lyricsRefreshing}
              onSelect={(e) => {
                e.preventDefault()
                onRefreshLyrics()
              }}
            >
              <LottieIcon
                name="refresh"
                className="size-4"
                spin={lyricsRefreshing}
                aria-hidden
              />
              {lyricsRefreshing ? "Searching for lyrics…" : "Re-search lyrics"}
            </DropdownMenuItem>
          ) : null}
          {onReportLyrics ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                onReportLyrics()
              }}
            >
              <LottieIcon name="flag" className="size-4" aria-hidden />
              Report lyrics
            </DropdownMenuItem>
          ) : null}
          {showTranslate && onTranslate ? (
            <DropdownMenuItem
              disabled={translating}
              onSelect={(e) => {
                e.preventDefault()
                onTranslate()
              }}
            >
              <LottieIcon name="languages" className="size-4" aria-hidden />
              {translating ? "Translating…" : "Translate lyrics"}
            </DropdownMenuItem>
          ) : null}
          {showSourcePicker ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <LottieIcon name="layers-2" className="size-3.5" aria-hidden />
                Current: {sourceLabel}
              </DropdownMenuLabel>
              {lyricsAlternates.map((alt) => {
                const label = LYRICS_PROVIDER_LABELS[alt.providerId] ?? alt.providerId
                const meta = [alt.synced ? "synced" : "plain", `${alt.lineCount} lines`]
                  .filter(Boolean)
                  .join(" · ")
                return (
                  <DropdownMenuItem
                    key={`${alt.providerId}-${alt.id}`}
                    className="h-auto min-h-[44px] flex-col items-start gap-0.5 py-2"
                    onSelect={() => onSelectAlternate!(alt)}
                  >
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {alt.trackName ?? "Unknown track"}
                      {alt.artistName ? ` — ${alt.artistName}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">{meta}</span>
                  </DropdownMenuItem>
                )
              })}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {feedback ? (
        <span className="sr-only" role="status">
          {feedback}
        </span>
      ) : null}
      <PlaylistFormDialog
        open={createOpen}
        title="New playlist"
        submitLabel="Create and add"
        onSubmit={handleCreate}
        onClose={() => setCreateOpen(false)}
      />
    </>
  )
}
