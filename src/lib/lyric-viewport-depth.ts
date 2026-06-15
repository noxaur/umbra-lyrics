/** Map pixel distance from stage center → 0..1 focus (1 = at center). */
export function focusFactorFromDistancePx(distancePx: number, stageHeight: number): number {
  if (stageHeight <= 0) return 0
  const half = stageHeight / 2
  return Math.max(0, 1 - distancePx / half)
}

export function viewportDistancePx(lineCenterY: number, stageCenterY: number): number {
  return Math.abs(lineCenterY - stageCenterY)
}

/** rAF-throttled scroll/resize listener — at most one callback per frame. */
export function createRafThrottle(fn: () => void): () => void {
  let scheduled = false
  return () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      fn()
    })
  }
}
