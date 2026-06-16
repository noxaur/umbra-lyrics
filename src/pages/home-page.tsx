import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { SongSearch } from "@/components/song-search"
import { UrlInput } from "@/components/url-input"
import { Button } from "@/components/ui/button"
import {
  clearRecentSongs,
  enrichRecentSongEnglish,
  formatRecentLabel,
  getRecentSongs,
  needsEnglishSubtitle,
  type RecentSong,
} from "@/lib/recent-songs"
import { readPlaylists } from "@/lib/playlists"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"

export function HomePage() {
  const [recent, setRecent] = useState<RecentSong[]>(() => getRecentSongs())
  const [playlists] = useState(() => readPlaylists())

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      if (!cancelled) setRecent(getRecentSongs())
    }

    const pending = recent
      .filter((song) => {
        const meta = `${song.artist} ${song.track}`.trim()
        return (
          needsEnglishSubtitle(meta) &&
          !(song.englishArtist?.trim() && song.englishTrack?.trim())
        )
      })
      .map((song) =>
        enrichRecentSongEnglish(song.videoId).then((updated) => {
          if (updated) refresh()
        }),
      )

    void Promise.all(pending)

    return () => {
      cancelled = true
    }
  }, [recent])

  return (
    <AppShell>
      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-balance">Sing along</h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Search for a song or paste a YouTube link to open synced lyrics and sing with the video.
          </p>
          <p className="mt-3 max-w-md text-center text-xs text-muted-foreground text-pretty">
            In the player, press Space to play or pause, use arrow keys to seek, and +/− to nudge
            lyric timing.
          </p>
        </div>
        <SongSearch />
        <div className="flex w-full max-w-xl items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" aria-hidden />
          <span>or paste a link</span>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>
        <UrlInput />
        {playlists.length > 0 && (
          <div className="w-full max-w-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Playlists</h2>
              <Link
                to="/playlists"
                className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                View all
              </Link>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {playlists.slice(0, 3).map((playlist) => (
                <li key={playlist.id}>
                  <Link
                    to={`/playlists/${playlist.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 truncate">{playlist.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {recent.length > 0 && (
          <div className="w-full max-w-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Recent</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearRecentSongs()
                  setRecent([])
                }}
              >
                Clear
              </Button>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {recent.map((song) => {
                const label = formatRecentLabel(song)
                return (
                  <li key={song.videoId}>
                    <Link
                      to={`/play/${song.videoId}`}
                      state={{ fromHome: true }}
                      title={label}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <img
                        src={youtubeThumbnailUrl(song.videoId)}
                        alt=""
                        width={68}
                        height={38}
                        loading="lazy"
                        decoding="async"
                        className="h-[2.375rem] w-[4.25rem] shrink-0 rounded-md border border-border/60 bg-muted object-cover"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>
    </AppShell>
  )
}
