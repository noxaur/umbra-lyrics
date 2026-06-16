import { useCallback, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Pencil, Play, Trash2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { NotFoundPage } from "@/pages/not-found-page"
import { PlaylistFormDialog } from "@/components/playlist-form-dialog"
import { PlaylistTrackRow } from "@/components/playlist-track-row"
import { Button } from "@/components/ui/button"
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
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setPlaylist(getPlaylistById(playlistId))
  }, [playlistId])

  if (!playlist) {
    return <NotFoundPage />
  }

  const playState = (trackIndex: number) => ({
    playlistContext: {
      playlistId: playlist.id,
      trackIndex,
    } satisfies PlaylistPlaybackContext,
  })

  const handlePlay = () => {
    const first = playlist.tracks[0]
    if (!first) return
    void navigate(`/play/${first.videoId}`, { state: playState(0) })
  }

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
          <ArrowLeft className="size-4" aria-hidden />
          All playlists
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold tracking-tight">{playlist.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setRenameOpen(true)}
            >
              <Pencil className="size-3.5" aria-hidden />
              Rename
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete
            </Button>
            <Button
              className="gap-1.5"
              onClick={handlePlay}
              disabled={playlist.tracks.length === 0}
            >
              <Play className="size-4" aria-hidden />
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
              Search for a song on the home page, then use Add to playlist in the player.
            </p>
            <Button asChild className="mt-4">
              <Link to="/">Find a song</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {playlist.tracks.map((track, index) => (
              <li key={track.videoId}>
                <PlaylistTrackRow
                  track={track}
                  index={index}
                  to={`/play/${track.videoId}`}
                  state={playState(index)}
                  draggable
                  dragIndex={dragIndex ?? undefined}
                  onDragStart={setDragIndex}
                  onDragOver={() => {}}
                  onDrop={handleDrop}
                  onRemove={() => handleRemove(track.videoId)}
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
    </AppShell>
  )
}
