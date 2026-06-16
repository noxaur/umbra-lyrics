import { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LyricsPasteModal } from "@/components/lyrics-paste-modal"
import { PROVIDER_FALLBACK_ORDER } from "@/lib/lyrics-providers"
import { usePlayerStore } from "@/stores/player-store"
import { LYRICS_PROVIDER_LABELS, type LyricsProviderId } from "@/types/lyrics"

type LyricsRetryProps = {
  onRetry: (artist: string, track: string, providerIds?: LyricsProviderId[]) => void
  onPaste: (text: string) => void
  onTranscribe?: () => void
  variant?: "not_found" | "partial" | "instrumental" | "network_error"
}

export function LyricsRetry({ onRetry, onPaste, onTranscribe, variant = "not_found" }: LyricsRetryProps) {
  const artist = usePlayerStore((s) => s.artist)
  const track = usePlayerStore((s) => s.track)
  const error = usePlayerStore((s) => s.error)
  const lyricsAttempts = usePlayerStore((s) => s.lyricsAttempts)
  const lyricsProvidersSearched = usePlayerStore((s) => s.lyricsProvidersSearched)
  const lrclibTrackId = usePlayerStore((s) => s.lrclibTrackId)
  const networkRetryCount = usePlayerStore((s) => s.networkRetryCount)
  const [artistInput, setArtistInput] = useState(artist)
  const [trackInput, setTrackInput] = useState(track)
  const [pasteOpen, setPasteOpen] = useState(false)

  const lastAttempts = lyricsAttempts.slice(-4)

  const headline =
    variant === "network_error"
      ? "Couldn't reach lyrics service"
      : variant === "instrumental"
        ? "Song found — marked instrumental"
        : variant === "partial"
          ? "Song found but no lyrics in database"
          : "No lyrics found"

  const detail =
    variant === "network_error"
      ? error ?? "Check your connection and try again."
      : variant === "instrumental"
        ? error ?? "This track is marked instrumental — paste lyrics or try another source."
        : variant === "partial"
          ? error ?? "A matching song exists but no lyric text was returned."
          : error ?? "Edit artist/title below and search again."

  const subline =
    variant === "network_error" && networkRetryCount > 0
      ? `Auto-retry attempted ${networkRetryCount} time${networkRetryCount === 1 ? "" : "s"}`
      : null

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8" role="alert">
        <div className="max-w-md text-center">
          <p className="font-medium text-foreground">{headline}</p>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          {subline ? <p className="mt-2 text-sm text-muted-foreground/80">{subline}</p> : null}
        </div>

        {(track || artist) && (
          <p className="text-center text-sm text-muted-foreground/80">
            Parsed as <span className="font-medium text-foreground">{track || "unknown track"}</span>
            {artist ? (
              <>
                {" "}
                by <span className="font-medium text-foreground">{artist}</span>
              </>
            ) : null}
          </p>
        )}

        {lyricsProvidersSearched.length > 0 && (
          <div className="w-full max-w-md rounded-md border border-border bg-muted/30 px-4 py-3 text-left text-sm">
            <p className="mb-2 font-medium text-foreground">
              Searched {lyricsProvidersSearched.length} source
              {lyricsProvidersSearched.length === 1 ? "" : "s"}
            </p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {lyricsProvidersSearched.map((id) => (
                <li key={id}>{LYRICS_PROVIDER_LABELS[id]}</li>
              ))}
            </ul>
          </div>
        )}

        {lastAttempts.length > 0 && (
          <div className="w-full max-w-md rounded-md border border-border bg-muted/30 px-4 py-3 text-left text-sm">
            <p className="mb-2 font-medium text-foreground">Tried recently</p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {lastAttempts.map((attempt) => (
                <li key={attempt}>{attempt.replaceAll("_", " ")}</li>
              ))}
            </ul>
          </div>
        )}

        {lrclibTrackId ? (
          <a
            href={`https://lrclib.net/${lrclibTrackId}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline"
          >
            View on LRCLIB →
          </a>
        ) : null}

        <div className="flex w-full max-w-md flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Artist</span>
            <Input
              value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              placeholder="Artist name"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Track</span>
            <Input
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              placeholder="Track title"
            />
          </label>
          <Button
            className="w-full"
            onClick={() => onRetry(artistInput.trim(), trackInput.trim())}
            disabled={!trackInput.trim()}
          >
            Retry all sources
          </Button>
          {onTranscribe ? (
            <Button className="w-full" variant="secondary" onClick={onTranscribe}>
              Transcribe from audio
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {PROVIDER_FALLBACK_ORDER.map((providerId) => (
              <Button
                key={providerId}
                variant="outline"
                size="sm"
                className="flex-1 min-w-[7rem]"
                onClick={() => onRetry(artistInput.trim(), trackInput.trim(), [providerId])}
                disabled={!trackInput.trim()}
              >
                {LYRICS_PROVIDER_LABELS[providerId]}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" variant="outline" onClick={() => setPasteOpen(true)}>
              Paste lyrics
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </div>

      <LyricsPasteModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(text) => {
          setPasteOpen(false)
          onPaste(text)
        }}
      />
    </>
  )
}
