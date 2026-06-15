import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { AppShell } from "@/components/app-shell"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { WatchRedirectPage } from "@/pages/watch-redirect-page"
import { PLAY_ROUTE_ALIASES } from "@/lib/route-suggestions"

const PlayerPage = lazy(() =>
  import("@/pages/player-page").then((module) => ({ default: module.PlayerPage })),
)
const ThemesPage = lazy(() =>
  import("@/pages/themes-page").then((module) => ({ default: module.ThemesPage })),
)
const ThemeBuilderPage = lazy(() =>
  import("@/pages/theme-builder-page").then((module) => ({ default: module.ThemeBuilderPage })),
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
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="/themes/build" element={<ThemeBuilderPage />} />
            <Route path="/watch" element={<WatchRedirectPage />} />
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
