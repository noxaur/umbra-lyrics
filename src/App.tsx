import { Routes, Route } from "react-router-dom"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { PlayerPage } from "@/pages/player-page"
import { ThemesPage } from "@/pages/themes-page"
import { ThemeBuilderPage } from "@/pages/theme-builder-page"
import { WatchRedirectPage } from "@/pages/watch-redirect-page"
import { PLAY_ROUTE_ALIASES } from "@/lib/route-suggestions"

const MISROUTED_PLAY_ALIASES = PLAY_ROUTE_ALIASES.filter((segment) => segment !== "play")

export default function App() {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
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
      </AppErrorBoundary>
    </ThemeProvider>
  )
}
