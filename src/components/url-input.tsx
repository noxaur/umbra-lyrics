import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Music } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { mediaResolveErrorMessage, resolveMediaInput } from "@/lib/media-url"
import { buildPlayerNavigationState } from "@/lib/player-navigation"
import type { SpotifyTrackHit } from "@/lib/spotify-to-youtube"

export function UrlInput() {
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [resolving, setResolving] = useState(false)
  const navigate = useNavigate()

  const goToPlayer = (videoId: string, track?: { artist: string; name: string; durationSec: number; isrc?: string }) => {
    setOpening(true)
    navigate(`/play/${videoId}`, {
      state: buildPlayerNavigationState(true, track
        ? {
            id: "",
            name: track.name,
            artist: track.artist,
            durationSec: track.durationSec,
            isrc: track.isrc,
          }
        : undefined),
    })
  }

  const handleResolve = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return

    setResolving(true)
    setError(null)

    try {
      const resolved = await resolveMediaInput(trimmed)
      if (resolved === null) {
        setError(mediaResolveErrorMessage({ kind: "invalid" }))
        return
      }
      if (!resolved.ok) {
        setError(mediaResolveErrorMessage(resolved.error))
        return
      }

      if (resolved.result.kind === "youtube") {
        goToPlayer(resolved.result.videoId)
        return
      }

      goToPlayer(resolved.result.videoId, resolved.result.track)
    } finally {
      setResolving(false)
    }
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    void handleResolve(url)
  }

  const onPaste = (value: string) => {
    setUrl(value)
    void handleResolve(value)
  }

  const busy = opening || resolving
  const statusMessage = opening
    ? "Opening player…"
    : resolving
      ? "Finding YouTube match…"
      : null

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-xl flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="text"
          inputMode="url"
          placeholder="Paste YouTube, Spotify, or song.opsec.rent link…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            setTimeout(() => onPaste(text), 0)
          }}
          disabled={busy}
          aria-invalid={!!error}
          aria-describedby={error ? "url-error" : statusMessage ? "url-opening" : undefined}
        />
        <Button type="submit" className="shrink-0" disabled={busy}>
          <AnimatedIcon icon={Music} />
          {opening ? "Opening…" : resolving ? "Finding…" : "Start"}
        </Button>
      </div>
      {statusMessage && (
        <p id="url-opening" className="text-sm text-muted-foreground" role="status">
          {statusMessage}
        </p>
      )}
      {error && (
        <p id="url-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
