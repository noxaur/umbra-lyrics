import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
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
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"

export function HomePage() {
  const [recent, setRecent] = useState<RecentSong[]>(() => getRecentSongs())

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
          <h1 className="text-4xl font-bold tracking-tight">Sing along</h1>
          <p className="mt-2 text-muted-foreground">
            Paste a YouTube link and karaoke with synced lyrics.
          </p>
        </div>
        <UrlInput />
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
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/30">
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
