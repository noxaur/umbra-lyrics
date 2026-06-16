import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, ListMusic, Plus } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { PlaylistFormDialog } from "@/components/playlist-form-dialog"
import { Button } from "@/components/ui/button"
import { createPlaylist, readPlaylists, type Playlist } from "@/lib/playlists"

export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>(() => readPlaylists())
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => setPlaylists(readPlaylists())

  const handleCreate = (name: string) => {
    const result = createPlaylist(name)
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setCreateOpen(false)
    refresh()
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back home
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance">Playlists</h1>
            <p className="mt-2 text-muted-foreground text-pretty">
              Save songs for your next karaoke session. Playlists are stored in this browser only.
            </p>
          </div>
          <Button className="gap-1.5 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New playlist
          </Button>
        </div>

        {error ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {playlists.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <ListMusic className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No playlists yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a playlist and add songs from the player.
            </p>
            <Button className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Create playlist
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <Link
                  to={`/playlists/${playlist.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate font-medium">{playlist.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PlaylistFormDialog
        open={createOpen}
        title="New playlist"
        submitLabel="Create"
        onSubmit={handleCreate}
        onClose={() => {
          setCreateOpen(false)
          setError(null)
        }}
      />
    </AppShell>
  )
}
