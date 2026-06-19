import { useEffect, useState } from "react"

/** Matches Tailwind `max-sm` — viewports narrower than 640px. */
export const NARROW_VIEWPORT_QUERY = "(max-width: 639px)"

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_VIEWPORT_QUERY).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(NARROW_VIEWPORT_QUERY)
    const onChange = () => setNarrow(media.matches)
    onChange()
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  return narrow
}
