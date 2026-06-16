import { Button } from "@/components/ui/button"
import { useSpotifyAuth } from "@/hooks/use-spotify-auth"

export function SpotifyLoginButton() {
  const { session, isLoggedIn, loading, error, login, logout } = useSpotifyAuth()

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
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void login()}
        disabled={loading}
        className="border-[#1DB954]/40 text-[#1DB954] hover:bg-[#1DB954]/10 hover:text-[#1DB954]"
      >
        {loading ? "Connecting…" : "Log in with Spotify"}
      </Button>
      {error ? (
        <span className="max-w-[12rem] text-right text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
