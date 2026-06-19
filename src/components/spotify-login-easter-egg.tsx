import { useEffect, useState, type CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import { SpotifyAngryLogo } from "@/components/spotify-angry-logo"
import { cn } from "@/lib/utils"

export const SPOTIFY_EASTER_EGG_CLICKS = 10

type Phase = "explode" | "angry" | "drag" | "exit"

type AnchorRect = {
  top: number
  left: number
  width: number
  height: number
}

type SpotifyLoginEasterEggProps = {
  anchor: AnchorRect
  onComplete: () => void
}

const PHASE_MS: Record<Phase, number> = {
  explode: 520,
  angry: 420,
  drag: 1400,
  exit: 900,
}

export function SpotifyLoginEasterEgg({ anchor, onComplete }: SpotifyLoginEasterEggProps) {
  const [phase, setPhase] = useState<Phase>("explode")

  useEffect(() => {
    const order: Phase[] = ["explode", "angry", "drag", "exit"]
    const index = order.indexOf(phase)
    const timer = window.setTimeout(() => {
      const next = order[index + 1]
      if (next) {
        setPhase(next)
        return
      }
      onComplete()
    }, PHASE_MS[phase])

    return () => window.clearTimeout(timer)
  }, [onComplete, phase])

  const centerX = anchor.left + anchor.width / 2
  const centerY = anchor.top + anchor.height / 2

  return (
    <div
      className="spotify-easter-egg-overlay"
      data-phase={phase}
      style={
        {
          "--spotify-egg-x": `${centerX}px`,
          "--spotify-egg-y": `${centerY}px`,
          "--spotify-egg-btn-w": `${anchor.width}px`,
          "--spotify-egg-btn-h": `${anchor.height}px`,
        } as CSSProperties
      }
    >
      {phase === "explode" ? (
        <>
          <div className="spotify-easter-egg-explosion" aria-hidden />
          <Button
            variant="outline"
            size="sm"
            type="button"
            tabIndex={-1}
            aria-hidden
            className="spotify-easter-egg-burst-btn cursor-not-allowed border-border/60 text-muted-foreground opacity-60"
          >
            Log in with Spotify
          </Button>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="spotify-easter-egg-particle" data-i={i} aria-hidden />
          ))}
        </>
      ) : null}

      {phase === "angry" || phase === "drag" || phase === "exit" ? (
        <SpotifyAngryLogo
          dragging={phase === "drag"}
          exiting={phase === "exit"}
          className={cn(phase === "angry" && "spotify-angry-logo--enter")}
        />
      ) : null}

      {phase === "drag" || phase === "exit" ? (
        <Button
          variant="outline"
          size="sm"
          type="button"
          tabIndex={-1}
          aria-hidden
          className="spotify-easter-egg-replacement-btn cursor-not-allowed border-border/60 text-muted-foreground opacity-60"
        >
          Log in with Spotify
        </Button>
      ) : null}
    </div>
  )
}
