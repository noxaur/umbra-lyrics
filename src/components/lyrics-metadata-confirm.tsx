import { useEffect, useState } from "react"
import { Music2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type LyricsMetadataConfirmProps = {
  artist: string
  track: string
  onConfirm: (artist: string, track: string) => void
}

export function LyricsMetadataConfirm({ artist, track, onConfirm }: LyricsMetadataConfirmProps) {
  const [artistInput, setArtistInput] = useState(artist)
  const [trackInput, setTrackInput] = useState(track)

  useEffect(() => {
    setArtistInput(artist)
    setTrackInput(track)
  }, [artist, track])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto overscroll-y-contain p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8"
      role="region"
      aria-labelledby="lyrics-metadata-confirm-title"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-muted/35">
          <Music2 className="size-8 text-muted-foreground/85" aria-hidden />
        </div>
        <p id="lyrics-metadata-confirm-title" className="font-medium text-foreground">
          Confirm song details
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Edit artist/title before searching lyrics.
        </p>
      </div>

      <p className="text-center text-sm text-muted-foreground/80">
        Parsed as <span className="font-medium text-foreground">{track || "unknown track"}</span>
        {artist ? (
          <>
            {" "}
            by <span className="font-medium text-foreground">{artist}</span>
          </>
        ) : null}
      </p>

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
          onClick={() => onConfirm(artistInput.trim(), trackInput.trim())}
          disabled={!trackInput.trim()}
        >
          Search lyrics
        </Button>
      </div>
    </div>
  )
}
