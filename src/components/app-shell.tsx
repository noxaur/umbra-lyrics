import { Link } from "react-router-dom"
import { RandomSongButton } from "@/components/random-song-button"
import { SettingsMenu } from "@/components/settings-menu"
import { SpotifyLoginButton } from "@/components/spotify-login-button"
import { cn } from "@/lib/utils"
import { usePlayerStore } from "@/stores/player-store"

export function AppShell({
  children,
  viewportLock = false,
  compactHeader = false,
}: {
  children: React.ReactNode
  viewportLock?: boolean
  /** Slim back bar for player pages on phones — saves vertical space for lyrics. */
  compactHeader?: boolean
}) {
  const focusMode = usePlayerStore((s) => s.focusMode)
  const stageFullscreen = usePlayerStore((s) => s.stageFullscreen)

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
      {!focusMode && !stageFullscreen && compactHeader ? (
        <>
          <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5 sm:hidden">
            <Link
              to="/"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              ← Home
            </Link>
            <div className="flex items-center gap-1">
              <SettingsMenu />
            </div>
          </header>
          <header className="hidden shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:flex">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                to="/"
                className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                umbra
              </Link>
              <Link
                to="/playlists"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Playlists
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <RandomSongButton />
              <SpotifyLoginButton />
              <SettingsMenu />
            </div>
          </header>
        </>
      ) : null}
      {!focusMode && !stageFullscreen && !compactHeader ? (
        <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              to="/"
              className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              umbra
            </Link>
            <Link
              to="/playlists"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm sm:inline"
            >
              Playlists
            </Link>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <RandomSongButton />
            <SpotifyLoginButton />
            <SettingsMenu />
          </div>
        </header>
      ) : null}
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
