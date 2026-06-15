import { useEffect, useRef } from "react"
import { usePlayerStore } from "@/stores/player-store"

export function useLyricsSync(getCurrentTime: () => number) {
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime)
  const getTimeRef = useRef(getCurrentTime)
  getTimeRef.current = getCurrentTime

  useEffect(() => {
    let frame = 0
    const tick = () => {
      setCurrentTime(getTimeRef.current())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [setCurrentTime])
}
