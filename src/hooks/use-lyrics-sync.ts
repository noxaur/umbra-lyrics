import { useEffect, useRef } from "react"
import { usePlayerStore } from "@/stores/player-store"

export type PlaybackClock = {
  timeSec: number
  isPlaying: boolean
}

/** Minimum delta before store subscribers re-render (avoids redundant paints). */
const TIME_EPSILON_SEC = 0.001

/**
 * Drives lyric sync from playback time at rAF cadence.
 * When playing, extrapolates between embed polls so karaoke wipe stays aligned.
 */
export function useLyricsSync(getPlayback: () => PlaybackClock) {
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime)
  const getPlaybackRef = useRef(getPlayback)
  getPlaybackRef.current = getPlayback
  const sampleRef = useRef({ timeSec: 0, isPlaying: false, at: 0 })

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const { timeSec, isPlaying } = getPlaybackRef.current()
      const now = performance.now()
      const sample = sampleRef.current

      if (Math.abs(timeSec - sample.timeSec) > TIME_EPSILON_SEC || isPlaying !== sample.isPlaying) {
        sampleRef.current = { timeSec, isPlaying, at: now }
      }

      const clock = sampleRef.current
      const resolved = clock.isPlaying
        ? clock.timeSec + (now - clock.at) / 1000
        : clock.timeSec

      const prev = usePlayerStore.getState().currentTime
      if (Math.abs(resolved - prev) > TIME_EPSILON_SEC) {
        setCurrentTime(resolved)
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [setCurrentTime])
}
