import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home-page"

const PlayerPage = lazy(() =>
  import("@/pages/player-page").then((module) => ({ default: module.PlayerPage })),
)
const ThemesPage = lazy(() =>
  import("@/pages/themes-page").then((module) => ({ default: module.ThemesPage })),
)
const ThemeBuilderPage = lazy(() =>
  import("@/pages/theme-builder-page").then((module) => ({ default: module.ThemeBuilderPage })),
)

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
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/themes" element={<ThemesPage />} />
          <Route path="/themes/build" element={<ThemeBuilderPage />} />
          <Route path="/play/:videoId" element={<PlayerPage />} />
        </Routes>
      </Suspense>
    </ThemeProvider>
  )
}
