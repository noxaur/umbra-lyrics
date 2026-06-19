import { useCallback, useEffect, useState } from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Link, useNavigate, useParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { NotFoundPage } from "@/pages/not-found-page"
import { PlaylistFormDialog } from "@/components/playlist-form-dialog"
import { PlaylistImportDialog } from "@/components/playlist-import-dialog"
import { PlaylistTrackRow } from "@/components/playlist-track-row"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { openPlaylistLyricsImport } from "@/lib/playlist-lyrics-import-open"
import {
  countIndexedLyricsInPlaylist,
  rejectLyrics,
  rejectLyricsForPlaylist,
  subscribeLyricsRejections,
} from "@/lib/lyrics-rejection"
import {
  getPlaylistIndexingState,
  runAutomaticPlaylistLyricsIndexing,
  subscribePlaylistIndexing,
} from "@/lib/playlist-lyrics-indexer"
import { listPlaylistIndexIssues } from "@/lib/playlist-index-issues"
import {
  deletePlaylist,
  getPlaylistById,
  isPlaylistId,
  movePlaylistTrack,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  renamePlaylist,
  type Playlist,
  type PlaylistPlaybackContext,
} from "@/lib/playlists"

export function PlaylistDetailPage() {
  const { playlistId = "" } = useParams()
  const navigate = useNavigate()

  if (!isPlaylistId(playlistId)) {
    return <NotFoundPage />
  }

  return <PlaylistDetailContent playlistId={playlistId} navigate={navigate} />
}

function PlaylistDetailContent({
  playlistId,
  navigate,
}: {
  playlistId: string
  navigate: ReturnType<typeof useNavigate>
}) {
  const [playlist, setPlaylist] = useState<Playlist | undefined>(() => getPlaylistById(playlistId))
  const [renameOpen, setRenameOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null)
  const [fetchBusy, setFetchBusy] = useState(false)

  const refresh = useCallback(() => {
    setPlaylist(getPlaylistById(playlistId))
  }, [playlistId])

  useEffect(() => {
    return subscribeLyricsRejections(() => refresh())
  }, [refresh])

  useEffect(() => {
    return subscribePlaylistIndexing((id, state) => {
      if (id !== playlistId) return
      const remaining = state.activeCount + state.queuedCount
      if (remaining > 0) {
        setIndexingStatus(`Indexing lyrics… ${remaining} remaining`)
      } else {
        setIndexingStatus(null)
      }
    })
  }, [playlistId])

  if (!playlist) {
    return <NotFoundPage />
  }

  const playState = (trackIndex: number) => ({
    playlistContext: {
      playlistId: playlist.id,
      trackIndex,
    } satisfies PlaylistPlaybackContext,
    playlistAutoPlay: true,
  })

  const handlePlay = () => {
    const first = playlist.tracks[0]
    if (!first) return
    void navigate(`/play/${first.videoId}`, { state: playState(0) })
  }

  const handleAutomaticFetch = async () => {
    setFetchBusy(true)
    setError(null)
    setIndexingStatus("Indexing lyrics…")
    try {
      const { hasIssues } = await runAutomaticPlaylistLyricsIndexing(playlistId)
      if (hasIssues) {
        const issueIds = listPlaylistIndexIssues()
          .filter((issue) => issue.playlistId === playlistId)
          .map((issue) => issue.videoId)
        openPlaylistLyricsImport({ playlistId, videoIds: issueIds })
      }
    } finally {
      setFetchBusy(false)
      const state = getPlaylistIndexingState(playlistId)
      if (state.activeCount + state.queuedCount === 0) {
        setIndexingStatus(null)
      }
    }
  }

  const handleInteractiveFetch = () => {
    openPlaylistLyricsImport({ playlistId })
  }

  const handleRejectAllLyrics = () => {
    if (
      !window.confirm(
        `Reject lyrics for all ${playlist.tracks.length} songs in "${playlist.name}"? Cached lyrics will be cleared and automatic indexing will skip these tracks.`,
      )
    ) {
      return
    }
    rejectLyricsForPlaylist(playlistId)
    refresh()
  }

  const handleRejectTrackLyrics = (videoId: string) => {
    rejectLyrics(videoId)
    refresh()
  }

  const indexedLyricsCount = countIndexedLyricsInPlaylist(playlistId)

  const handleRemove = (videoId: string) => {
    removeTrackFromPlaylist(playlist.id, videoId)
    refresh()
  }

  const handleMove = (videoId: string, direction: "up" | "down") => {
    movePlaylistTrack(playlist.id, videoId, direction)
    refresh()
  }

  const handleDrop = (toIndex: number) => {
    if (dragIndex == null || dragIndex === toIndex) {
      setDragIndex(null)
      return
    }
    reorderPlaylistTracks(playlist.id, dragIndex, toIndex)
    setDragIndex(null)
    refresh()
  }

  const handleRename = (name: string) => {
    const result = renamePlaylist(playlist.id, name)
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setRenameOpen(false)
    refresh()
  }

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete "${playlist.name}"? This cannot be undone.`,
      )
    ) {
      return
    }
    deletePlaylist(playlist.id)
    void navigate("/playlists")
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          to="/playlists"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <LottieIcon name="arrow-left" className="size-4" aria-hidden />
          All playlists
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold tracking-tight">{playlist.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"}
            </p>
            {indexingStatus ? (
              <p className="mt-1 text-xs text-muted-foreground" role="status">
                {indexingStatus}
              </p>
            ) : null}
            {indexedLyricsCount > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {indexedLyricsCount} with indexed lyrics
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setImportOpen(true)}
            >
              <LottieIcon name="download" className="size-3.5" aria-hidden />
              Import
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={playlist.tracks.length === 0 || fetchBusy}
                >
                  <LottieIcon name="file-music" className="size-3.5" aria-hidden />
                  Fetch lyrics
                  <LottieIcon name="chevron-down" className="size-3 opacity-60" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleAutomaticFetch()}>
                  Try automatically
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleInteractiveFetch}>
                  Interactive import
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={playlist.tracks.length === 0}
                  onSelect={handleRejectAllLyrics}
                >
                  Reject all lyrics
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setRenameOpen(true)}
            >
              <LottieIcon name="pencil" className="size-3.5" aria-hidden />
              Rename
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <LottieIcon name="trash-2" className="size-3.5" aria-hidden />
              Delete
            </Button>
            <Button
              className="gap-1.5"
              onClick={handlePlay}
              disabled={playlist.tracks.length === 0}
            >
              <LottieIcon name="play" className="size-4" aria-hidden />
              Play
            </Button>
          </div>
        </div>

        {error ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {playlist.tracks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <p className="font-medium">This playlist is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import from YouTube or search for a song on the home page, then use Add to playlist in
              the player.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button className="gap-1.5" onClick={() => setImportOpen(true)}>
                <LottieIcon name="download" className="size-4" aria-hidden />
                Import from YouTube
              </Button>
              <Button asChild variant="outline">
                <Link to="/">Find a song</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {playlist.tracks.map((track, index) => (
              <li key={track.videoId}>
                <PlaylistTrackRow
                  track={track}
                  index={index}
                  playlistId={playlist.id}
                  to={`/play/${track.videoId}`}
                  state={playState(index)}
                  draggable
                  dragIndex={dragIndex ?? undefined}
                  onDragStart={setDragIndex}
                  onDragOver={() => {}}
                  onDrop={handleDrop}
                  onRemove={() => handleRemove(track.videoId)}
                  onRejectLyrics={() => handleRejectTrackLyrics(track.videoId)}
                  onMoveUp={index > 0 ? () => handleMove(track.videoId, "up") : undefined}
                  onMoveDown={
                    index < playlist.tracks.length - 1
                      ? () => handleMove(track.videoId, "down")
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <PlaylistFormDialog
        open={renameOpen}
        title="Rename playlist"
        initialName={playlist.name}
        submitLabel="Save"
        onSubmit={handleRename}
        onClose={() => {
          setRenameOpen(false)
          setError(null)
        }}
      />

      <PlaylistImportDialog
        open={importOpen}
        mode="existing"
        targetPlaylistId={playlist.id}
        onImported={refresh}
        onClose={() => setImportOpen(false)}
      />
    </AppShell>
  )
}
