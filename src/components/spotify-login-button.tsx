import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  SpotifyLoginEasterEgg,
  SPOTIFY_EASTER_EGG_CLICKS,
  type AnchorRect,
} from "@/components/spotify-login-easter-egg"
import { useSpotifyAuth } from "@/hooks/use-spotify-auth"
import { pushQueueNotification } from "@/lib/queue-notifications"

const CLICK_WINDOW_MS = 4000

function showSpotifyDisabledNotice(): void {
  pushQueueNotification({
    kind: "info",
    title: "Spotify login unavailable",
    message: "Spotify login is currently disabled.",
    dismissAfterMs: 3000,
  })
}

type SpotifyLoginButtonProps = {
  /** Shorter label for tight mobile headers. */
  compact?: boolean
}

export function SpotifyLoginButton({ compact = false }: SpotifyLoginButtonProps) {
  const { session, isLoggedIn, logout } = useSpotifyAuth()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const clickCountRef = useRef(0)
  const lastClickAtRef = useRef(0)
  const [easterEggAnchor, setEasterEggAnchor] = useState<AnchorRect | null>(null)

  useEffect(() => {
    if (!easterEggAnchor) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [easterEggAnchor])

  const registerTap = useCallback(() => {
    if (easterEggAnchor) return

    const now = Date.now()
    if (now - lastClickAtRef.current > CLICK_WINDOW_MS) {
      clickCountRef.current = 0
    }
    lastClickAtRef.current = now

    clickCountRef.current += 1
    if (clickCountRef.current >= SPOTIFY_EASTER_EGG_CLICKS) {
      const button = buttonRef.current
      const rect = button?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        button?.blur()
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

    if (clickCountRef.current === 1) {
      showSpotifyDisabledNotice()
    }
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

  const label = compact ? "Spotify" : "Log in with Spotify"

  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        type="button"
        aria-label="Log in with Spotify (unavailable — click for details)"
        title="Spotify login is currently disabled — click for details"
        tabIndex={easterEggAnchor ? -1 : undefined}
        aria-hidden={easterEggAnchor ? true : undefined}
        onClick={registerTap}
        className={cn(
          "touch-manipulation cursor-not-allowed border-border/60 text-muted-foreground opacity-60 hover:bg-transparent hover:text-muted-foreground",
          easterEggAnchor && "invisible",
        )}
      >
        {label}
      </Button>
      {easterEggAnchor ? (
        <SpotifyLoginEasterEgg anchor={easterEggAnchor} onComplete={handleEasterEggComplete} />
      ) : null}
    </>
  )
}
