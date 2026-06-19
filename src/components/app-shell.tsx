import { Link } from "react-router-dom"
import { ModeToggle } from "@/components/mode-toggle"
import { SpotifyLoginButton } from "@/components/spotify-login-button"
import { cn } from "@/lib/utils"
import { usePlayerStore } from "@/stores/player-store"

export function AppShell({
  children,
  viewportLock = false,
}: {
  children: React.ReactNode
  viewportLock?: boolean
}) {
  const focusMode = usePlayerStore((s) => s.focusMode)

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-modal",
          "rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-lg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        Skip to content
      </a>
      {!focusMode && (
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              song-kara
            </Link>
            <Link
              to="/playlists"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Playlists
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <SpotifyLoginButton />
            <ModeToggle />
          </div>
        </header>
      )}
      <main
        id="main-content"
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          viewportLock ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {children}
      </main>
    </div>
  )
}
