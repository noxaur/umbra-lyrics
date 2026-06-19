import { useCallback, useEffect, useRef, useState } from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { buildPlayerNavigationState } from "@/lib/player-navigation"
import { resolveRandomSong } from "@/lib/random-song"

export function RandomSongButton() {
  const navigate = useNavigate()
  const { videoId: currentVideoId } = useParams<{ videoId?: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort()
      fetchAbortRef.current = null
    }
  }, [])

  const playRandomSong = useCallback(async () => {
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const song = await resolveRandomSong({
        excludeVideoId: currentVideoId,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
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
      if (controller.signal.aborted) return
      setError("Random song unavailable")
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
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
        <LottieIcon name="shuffle" hover />
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
