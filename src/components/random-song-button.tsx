import { useCallback, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Shuffle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { buildPlayerNavigationState } from "@/lib/player-navigation"
import { resolveRandomSong } from "@/lib/random-song"

export function RandomSongButton() {
  const navigate = useNavigate()
  const { videoId: currentVideoId } = useParams<{ videoId?: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const playRandomSong = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const song = await resolveRandomSong({ excludeVideoId: currentVideoId })
      if (!song) {
        setError("No random song found")
        return
      }

      navigate(`/play/${song.videoId}`, {
        state: buildPlayerNavigationState(true, song.seedMetadata, {
          canonicalChecked: song.seedMetadata ? song.videoId : undefined,
        }),
      })
    } catch {
      setError("Random song unavailable")
    } finally {
      setLoading(false)
    }
  }, [currentVideoId, navigate])

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void playRandomSong()}
        disabled={loading}
        aria-label="Play a random song"
      >
        <AnimatedIcon icon={Shuffle} />
        {loading ? "Picking…" : "Random"}
      </Button>
      {error ? (
        <span className="max-w-[12rem] text-right text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
