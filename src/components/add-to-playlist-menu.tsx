import { useState } from "react"
import { ListMusic, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PlaylistFormDialog } from "@/components/playlist-form-dialog"
import {
  addTrackToPlaylist,
  createPlaylist,
  readPlaylists,
  type PlaylistTrack,
} from "@/lib/playlists"

type AddToPlaylistMenuProps = {
  track: Omit<PlaylistTrack, "addedAt">
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "icon"
  className?: string
}

export function AddToPlaylistMenu({
  track,
  variant = "outline",
  size = "sm",
  className,
}: AddToPlaylistMenuProps) {
  const [playlists, setPlaylists] = useState(() => readPlaylists())
  const [createOpen, setCreateOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const refresh = () => setPlaylists(readPlaylists())

  const handleAdd = (playlistId: string) => {
    const result = addTrackToPlaylist(playlistId, track)
    refresh()
    if (result.error) {
      setFeedback(result.error)
    } else {
      const playlist = result.playlist
      setFeedback(playlist ? `Added to ${playlist.name}` : "Added to playlist")
    }
    window.setTimeout(() => setFeedback(null), 2500)
  }

  const handleCreate = (name: string) => {
    const created = createPlaylist(name)
    if (created.error) {
      setFeedback(created.error)
      setCreateOpen(false)
      return
    }
    addTrackToPlaylist(created.playlist.id, track)
    refresh()
    setCreateOpen(false)
    setFeedback(`Added to ${created.playlist.name}`)
    window.setTimeout(() => setFeedback(null), 2500)
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && refresh()}>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className={cn("gap-1.5", className)}>
            <ListMusic className="size-4" aria-hidden />
            {size !== "icon" ? <span>Add to playlist</span> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
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
            <Plus className="size-4" aria-hidden />
            New playlist
          </DropdownMenuItem>
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

export function AddToPlaylistMenuIcon(props: AddToPlaylistMenuProps) {
  return <AddToPlaylistMenu {...props} size="icon" variant="outline" className="size-9" />
}
