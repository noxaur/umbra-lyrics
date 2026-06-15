/** Line changes faster than this use instant scroll to avoid chase lag. */
export const FAST_LINE_CHANGE_MS = 450

/** Uniform visual distance when no line is active (intro / gap). */
export const IDLE_DISTANCE_FROM_ACTIVE = 8

export function isOutsideCenterThird(
  element: HTMLElement,
  container: HTMLElement,
): boolean {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const elementCenter = elementRect.top + elementRect.height / 2
  const third = containerRect.height / 3
  const centerTop = containerRect.top + third
  const centerBottom = containerRect.top + 2 * third
  return elementCenter < centerTop || elementCenter > centerBottom
}

export function getDistanceFromActive(lineIndex: number, activeIndex: number): number {
  if (activeIndex < 0) return IDLE_DISTANCE_FROM_ACTIVE
  return lineIndex - activeIndex
}

export function getScrollBehavior(
  prefersReducedMotion: boolean,
  msSinceLastLineChange?: number,
): ScrollBehavior {
  if (prefersReducedMotion) return "auto"
  if (
    msSinceLastLineChange !== undefined &&
    msSinceLastLineChange < FAST_LINE_CHANGE_MS
  ) {
    return "auto"
  }
  return "smooth"
}

export function scrollLineToCenter(
  element: HTMLElement,
  container: HTMLElement,
  behavior: ScrollBehavior,
  { force = false }: { force?: boolean } = {},
): void {
  if (!force && !isOutsideCenterThird(element, container)) return

  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const elementCenter = elementRect.top + elementRect.height / 2
  const containerCenter = containerRect.top + container.clientHeight / 2
  const nextTop = container.scrollTop + (elementCenter - containerCenter)

  if (behavior === "auto" || typeof container.scrollTo !== "function") {
    container.scrollTop = nextTop
    return
  }

  container.scrollTo({ top: nextTop, behavior })
}
