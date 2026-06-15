/** Line changes faster than this use a shorter handoff animation. */
export const FAST_LINE_CHANGE_MS = 450

/** Single timing for lyric scroll handoffs and re-sync snaps. */
export const LYRICS_HANDOFF_MS = 360

/** Default eased handoff when advancing to the next lyric line. */
export const LINE_HANDOFF_MS = LYRICS_HANDOFF_MS

/** @deprecated Fast chorus uses the same handoff pace for unified motion. */
export const FAST_LINE_HANDOFF_MS = LYRICS_HANDOFF_MS

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

export function getLineHandoffDurationMs(
  prefersReducedMotion: boolean,
  _msSinceLastLineChange?: number,
): number {
  if (prefersReducedMotion) return 0
  return LYRICS_HANDOFF_MS
}

/** @deprecated Use getLineHandoffDurationMs — kept for compatibility. */
export function getScrollBehavior(
  prefersReducedMotion: boolean,
  msSinceLastLineChange?: number,
): ScrollBehavior {
  return getLineHandoffDurationMs(prefersReducedMotion, msSinceLastLineChange) > 0
    ? "smooth"
    : "auto"
}

function clampScrollTop(container: HTMLElement, nextTop: number): number {
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
  return Math.max(0, Math.min(nextTop, maxScroll))
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
  const nextTop = clampScrollTop(
    container,
    container.scrollTop + (elementCenter - containerCenter),
  )

  if (behavior === "auto" || typeof container.scrollTo !== "function") {
    container.scrollTop = nextTop
    return
  }

  container.scrollTo({ top: nextTop, behavior })
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

/** Eased scroll to center — used for lyric handoffs and manual re-sync snaps. */
export function scrollLineToCenterEase(
  element: HTMLElement,
  container: HTMLElement,
  durationMs = 200,
  { force = false }: { force?: boolean } = {},
): void {
  if (!force && !isOutsideCenterThird(element, container)) return

  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const elementCenter = elementRect.top + elementRect.height / 2
  const containerCenter = containerRect.top + container.clientHeight / 2
  const targetTop = clampScrollTop(
    container,
    container.scrollTop + (elementCenter - containerCenter),
  )
  const startTop = container.scrollTop
  const delta = targetTop - startTop
  if (Math.abs(delta) < 0.5) {
    container.scrollTop = targetTop
    return
  }

  const startTime = performance.now()
  const tick = (now: number) => {
    const t = Math.min(1, (now - startTime) / durationMs)
    container.scrollTop = startTop + delta * easeOutCubic(t)
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
