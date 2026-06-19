import { lazy, Suspense, useEffect } from "react"
import { Routes, Route } from "react-router-dom"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { AppShell } from "@/components/app-shell"
import { PlaylistIndexPrompt } from "@/components/playlist-index-prompt"
import { QueueToastHost } from "@/components/queue-toast-host"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { WatchRedirectPage } from "@/pages/watch-redirect-page"
import { SpotifyCallbackPage } from "@/pages/spotify-callback-page"
import { PLAY_ROUTE_ALIASES } from "@/lib/route-suggestions"
import { resumeQueuePrefetch } from "@/lib/song-queue-worker"

const PlayerPage = lazy(() =>
  import("@/pages/player-page").then((module) => ({ default: module.PlayerPage })),
)
const ThemesPage = lazy(() =>
  import("@/pages/themes-page").then((module) => ({ default: module.ThemesPage })),
)
const ThemeBuilderPage = lazy(() =>
  import("@/pages/theme-builder-page").then((module) => ({ default: module.ThemeBuilderPage })),
)
const PlaylistsPage = lazy(() =>
  import("@/pages/playlists-page").then((module) => ({ default: module.PlaylistsPage })),
)
const PlaylistDetailPage = lazy(() =>
  import("@/pages/playlist-detail-page").then((module) => ({ default: module.PlaylistDetailPage })),
)

const MISROUTED_PLAY_ALIASES = PLAY_ROUTE_ALIASES.filter((segment) => segment !== "play")

function RouteLoading() {
  return (
    <AppShell>
      <div
        className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
        Loading…
      </div>
    </AppShell>
  )
}

export default function App() {
  useEffect(() => {
    resumeQueuePrefetch()
  }, [])

  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <PlaylistIndexPrompt />
        <QueueToastHost />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="/themes/build" element={<ThemeBuilderPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} />
            <Route path="/watch" element={<WatchRedirectPage />} />
            <Route path="/auth/spotify/callback" element={<SpotifyCallbackPage />} />
            {MISROUTED_PLAY_ALIASES.map((segment) => (
              <Route
                key={segment}
                path={`/${segment}/:videoId`}
                element={<NotFoundPage />}
              />
            ))}
            <Route path="/theme/*" element={<NotFoundPage />} />
            <Route path="/theme" element={<NotFoundPage />} />
            <Route path="/play/:videoId" element={<PlayerPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AppErrorBoundary>
    </ThemeProvider>
  )
}
