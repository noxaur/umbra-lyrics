import { useState } from "react"
import { Link } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { UrlInput } from "@/components/url-input"
import { Button } from "@/components/ui/button"
import { clearRecentSongs, getRecentSongs, type RecentSong } from "@/lib/recent-songs"

export function HomePage() {
  const [recent, setRecent] = useState<RecentSong[]>(() => getRecentSongs())

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
            <ul className="divide-y divide-border rounded-lg border border-border">
              {recent.map((song) => (
                <li key={song.videoId}>
                  <Link
                    to={`/play/${song.videoId}`}
                    className="flex px-4 py-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {song.title || song.videoId}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </AppShell>
  )
}
