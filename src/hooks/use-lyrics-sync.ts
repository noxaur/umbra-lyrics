import { useEffect } from "react"
import { usePlayerStore } from "@/stores/player-store"

export function useLyricsSync(getCurrentTime: () => number) {
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      setCurrentTime(getCurrentTime())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [getCurrentTime, setCurrentTime])
}
