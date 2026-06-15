import { Link } from "react-router-dom"
import { ModeToggle } from "@/components/mode-toggle"
import { usePlayerStore } from "@/stores/player-store"

export function AppShell({ children }: { children: React.ReactNode }) {
  const focusMode = usePlayerStore((s) => s.focusMode)

  return (
    <div className="flex min-h-svh flex-col">
      {!focusMode && (
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <Link
            to="/"
            className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            song-kara
          </Link>
          <ModeToggle />
        </header>
      )}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
