/** Active line center within this many px of stage center counts as exactly centered. */
export const LYRICS_CENTER_THRESHOLD_PX = 24

export type LyricsResyncDecision =
  | { action: "none" }
  | { action: "resync" }
  | { action: "wait_for_center" }

export function getDistanceFromCenter(lineIndex: number, centerIndex: number): number {
  return Math.abs(lineIndex - centerIndex)
}

/**
 * Whether follow mode should re-engage after the user stops scrolling.
 * - Intentional (tap active or active nearest center on release): wait for exact center.
 * - Otherwise: re-sync when active is within ±1 of the centered line.
 */
export function decideLyricsResync(input: {
  activeIndex: number
  centerIndex: number
  activeExactlyCentered: boolean
  intentionalActiveScroll: boolean
}): LyricsResyncDecision {
  const { activeIndex, centerIndex, activeExactlyCentered, intentionalActiveScroll } = input
  if (activeIndex < 0 || centerIndex < 0) return { action: "none" }

  if (intentionalActiveScroll) {
    return activeExactlyCentered ? { action: "resync" } : { action: "wait_for_center" }
  }

  if (getDistanceFromCenter(activeIndex, centerIndex) <= 1) {
    return { action: "resync" }
  }

  return { action: "none" }
}

export function findNearestLineIndexToCenter(
  lineCenters: Array<{ index: number; centerY: number }>,
  stageCenterY: number,
): number {
  if (lineCenters.length === 0) return -1
  let best = lineCenters[0]
  let bestDist = Math.abs(best.centerY - stageCenterY)
  for (let i = 1; i < lineCenters.length; i++) {
    const candidate = lineCenters[i]
    const dist = Math.abs(candidate.centerY - stageCenterY)
    if (dist < bestDist) {
      best = candidate
      bestDist = dist
    }
  }
  return best.index
}

export function isElementCenteredInContainer(
  element: HTMLElement,
  container: HTMLElement,
  thresholdPx = LYRICS_CENTER_THRESHOLD_PX,
): boolean {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const stageCenterY = containerRect.top + containerRect.height / 2
  const elementCenterY = elementRect.top + elementRect.height / 2
  return Math.abs(elementCenterY - stageCenterY) <= thresholdPx
}

export function wasActiveNearestOnScrollEnd(
  activeIndex: number,
  centerIndex: number,
): boolean {
  return activeIndex >= 0 && centerIndex === activeIndex
}
