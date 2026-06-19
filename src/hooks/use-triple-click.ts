import { useCallback, useRef } from "react"

const DEFAULT_WINDOW_MS = 600

export function useTripleClick(
  onTripleClick: () => void,
  options?: { windowMs?: number },
) {
  const clicksRef = useRef<number[]>([])
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS

  const onClick = useCallback(
    (event: React.MouseEvent) => {
      const now = Date.now()
      clicksRef.current = clicksRef.current.filter((timestamp) => now - timestamp < windowMs)
      clicksRef.current.push(now)

      if (clicksRef.current.length >= 3) {
        clicksRef.current = []
        event.preventDefault()
        onTripleClick()
      }
    },
    [onTripleClick, windowMs],
  )

  return onClick
}
