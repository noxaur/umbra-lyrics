import { Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home-page"
import { PlayerPage } from "@/pages/player-page"
import { ThemesPage } from "@/pages/themes-page"
import { ThemeBuilderPage } from "@/pages/theme-builder-page"

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/themes" element={<ThemesPage />} />
        <Route path="/themes/build" element={<ThemeBuilderPage />} />
        <Route path="/play/:videoId" element={<PlayerPage />} />
      </Routes>
    </ThemeProvider>
  )
}
