import { useEffect } from "react"
import { usePlayerStore } from "@/stores/player-store"

export function useKeyboardShortcuts() {
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const seekBy = usePlayerStore((s) => s.seekBy)
  const adjustOffset = usePlayerStore((s) => s.adjustOffset)
  const playlistContext = usePlayerStore((s) => s.playlistContext)
  const goToNextPlaylistTrack = usePlayerStore((s) => s.goToNextPlaylistTrack)
  const goToPrevPlaylistTrack = usePlayerStore((s) => s.goToPrevPlaylistTrack)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      switch (e.key) {
        case " ":
          e.preventDefault()
          togglePlay()
          break
        case "ArrowLeft":
          e.preventDefault()
          if (e.shiftKey && playlistContext) goToPrevPlaylistTrack()
          else seekBy(-5)
          break
        case "ArrowRight":
          e.preventDefault()
          if (e.shiftKey && playlistContext) goToNextPlaylistTrack()
          else seekBy(5)
          break
        case "+":
        case "=":
          adjustOffset(500)
          break
        case "-":
          adjustOffset(-500)
          break
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [togglePlay, seekBy, adjustOffset, playlistContext, goToNextPlaylistTrack, goToPrevPlaylistTrack])
}
