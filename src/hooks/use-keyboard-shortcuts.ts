import { useEffect } from "react"
import { usePlayerStore } from "@/stores/player-store"

export function useKeyboardShortcuts() {
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const seekBy = usePlayerStore((s) => s.seekBy)
  const adjustOffset = usePlayerStore((s) => s.adjustOffset)

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
          seekBy(-5)
          break
        case "ArrowRight":
          e.preventDefault()
          seekBy(5)
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
  }, [togglePlay, seekBy, adjustOffset])
}
