import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  SpotifyLoginEasterEgg,
  SPOTIFY_EASTER_EGG_CLICKS,
  type AnchorRect,
} from "@/components/spotify-login-easter-egg"
import { useSpotifyAuth } from "@/hooks/use-spotify-auth"
import { pushQueueNotification } from "@/lib/queue-notifications"

function showSpotifyDisabledNotice(): void {
  pushQueueNotification({
    kind: "info",
    title: "Spotify login unavailable",
    message: "Spotify login is currently disabled.",
    dismissAfterMs: 3000,
  })
}

export function SpotifyLoginButton() {
  const { session, isLoggedIn, logout } = useSpotifyAuth()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const clickCountRef = useRef(0)
  const [easterEggAnchor, setEasterEggAnchor] = useState<AnchorRect | null>(null)

  const handleDisabledClick = useCallback(() => {
    if (easterEggAnchor) return

    clickCountRef.current += 1
    if (clickCountRef.current >= SPOTIFY_EASTER_EGG_CLICKS) {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) {
        setEasterEggAnchor({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        })
      }
      clickCountRef.current = 0
      return
    }

    showSpotifyDisabledNotice()
  }, [easterEggAnchor])

  const handleEasterEggComplete = useCallback(() => {
    setEasterEggAnchor(null)
    showSpotifyDisabledNotice()
  }, [])

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
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        type="button"
        aria-label="Log in with Spotify (unavailable — click for details)"
        title="Spotify login is currently disabled — click for details"
        onClick={handleDisabledClick}
        className={cn(
          "cursor-not-allowed border-border/60 text-muted-foreground opacity-60 hover:bg-transparent hover:text-muted-foreground",
          easterEggAnchor && "invisible",
        )}
      >
        Log in with Spotify
      </Button>
      {easterEggAnchor ? (
        <SpotifyLoginEasterEgg anchor={easterEggAnchor} onComplete={handleEasterEggComplete} />
      ) : null}
    </>
  )
}
