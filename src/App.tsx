import { Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home-page"
import { PlayerPage } from "@/pages/player-page"

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/play/:videoId" element={<PlayerPage />} />
      </Routes>
    </ThemeProvider>
  )
}
