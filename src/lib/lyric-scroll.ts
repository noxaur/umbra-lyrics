/** Line changes faster than this use a shorter handoff animation. */
export const FAST_LINE_CHANGE_MS = 450

/** Shorter handoff when lines advance faster than FAST_LINE_CHANGE_MS. */
export const FAST_LINE_HANDOFF_MS = 160

/** Single timing for lyric scroll handoffs and re-sync snaps. */
export const LYRICS_HANDOFF_MS = 360

/** Default eased handoff when advancing to the next lyric line. */
export const LINE_HANDOFF_MS = LYRICS_HANDOFF_MS

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
  _prefersReducedMotion: boolean,
  _msSinceLastLineChange?: number,
): number {
  return 0
}

/** @deprecated Use instant scroll — kept for compatibility. */
export function getScrollBehavior(
  _prefersReducedMotion?: boolean,
  _msSinceLastLineChange?: number,
): ScrollBehavior {
  return "auto"
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
  const containerCenter = containerRect.top + containerRect.height / 2
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

const scrollEaseRuns = new WeakMap<HTMLElement, number>()

/** Eased scroll to center — used for lyric handoffs and manual re-sync snaps. */
export function scrollLineToCenterEase(
  element: HTMLElement,
  container: HTMLElement,
  durationMs = 200,
  { force = false, onTick }: { force?: boolean; onTick?: () => void } = {},
): void {
  if (!force && !isOutsideCenterThird(element, container)) return

  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const elementCenter = elementRect.top + elementRect.height / 2
  const containerCenter = containerRect.top + containerRect.height / 2
  const targetTop = clampScrollTop(
    container,
    container.scrollTop + (elementCenter - containerCenter),
  )
  const startTop = container.scrollTop
  const delta = targetTop - startTop
  if (Math.abs(delta) < 0.5) {
    container.scrollTop = targetTop
    onTick?.()
    return
  }

  const runId = (scrollEaseRuns.get(container) ?? 0) + 1
  scrollEaseRuns.set(container, runId)

  const startTime = performance.now()
  const tick = (now: number) => {
    if (scrollEaseRuns.get(container) !== runId) return

    const t = Math.min(1, (now - startTime) / durationMs)
    container.scrollTop = startTop + delta * easeOutCubic(t)
    onTick?.()
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
