import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePlayerStore } from "@/stores/player-store"

type LyricsRetryProps = {
  onRetry: (artist: string, track: string) => void
}

export function LyricsRetry({ onRetry }: LyricsRetryProps) {
  const artist = usePlayerStore((s) => s.artist)
  const track = usePlayerStore((s) => s.track)
  const error = usePlayerStore((s) => s.error)
  const [artistInput, setArtistInput] = useState(artist)
  const [trackInput, setTrackInput] = useState(track)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-center text-muted-foreground">
        {error ?? "No lyrics found — edit artist/title and retry"}
      </p>
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
          onClick={() => onRetry(artistInput.trim(), trackInput.trim())}
          disabled={!trackInput.trim()}
        >
          Search again
        </Button>
      </div>
    </div>
  )
}
