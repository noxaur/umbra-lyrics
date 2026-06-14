import { Routes, Route } from "react-router-dom"

function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">song-kara</h1>
      <p className="text-muted-foreground">Paste a YouTube link to start singing.</p>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  )
}
