import { Button } from "@/components/ui/button"
import { useSpotifyAuth } from "@/hooks/use-spotify-auth"
import { pushQueueNotification } from "@/lib/queue-notifications"

function showSpotifyDisabledNotice(): void {
  pushQueueNotification({
    kind: "info",
    title: "Spotify login unavailable",
    message: "Spotify login is disabled currently.",
    dismissAfterMs: 3000,
  })
}

export function SpotifyLoginButton() {
  const { session, isLoggedIn, logout } = useSpotifyAuth()

  if (isLoggedIn && session) {
    return (
      <div className="flex items-center gap-2">
        {session.imageUrl ? (
          <img
            src={session.imageUrl}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-full border border-border object-cover"
          />
        ) : null}
        <span className="hidden max-w-[8rem] truncate text-sm text-muted-foreground sm:inline">
          {session.displayName}
        </span>
        <Button variant="ghost" size="sm" onClick={logout}>
          Log out
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      aria-disabled="true"
      onClick={showSpotifyDisabledNotice}
      className="cursor-not-allowed border-border/60 text-muted-foreground opacity-60 hover:bg-transparent hover:text-muted-foreground"
    >
      Log in with Spotify
    </Button>
  )
}
