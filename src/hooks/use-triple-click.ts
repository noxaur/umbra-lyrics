import { useCallback } from "react"

const DEFAULT_WINDOW_MS = 600

/** Survives AppShell remounts when the first home click navigates from another route. */
let recentClickTimestamps: number[] = []

/** @internal */
export function resetTripleClickDetectionForTests() {
  recentClickTimestamps = []
}

export function useTripleClick(
  onTripleClick: () => void,
  options?: { windowMs?: number },
) {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS

  const onClick = useCallback(
    (event: React.MouseEvent) => {
      const now = Date.now()
      recentClickTimestamps = recentClickTimestamps.filter(
        (timestamp) => now - timestamp < windowMs,
      )
      recentClickTimestamps.push(now)

      if (recentClickTimestamps.length >= 3) {
        recentClickTimestamps = []
        event.preventDefault()
        onTripleClick()
      }
    },
    [onTripleClick, windowMs],
  )

  return onClick
}
