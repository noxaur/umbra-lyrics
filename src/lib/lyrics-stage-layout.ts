/** Half-viewport minus half a line — lets first/last lyrics sit at stage center. */
export function stageEdgeSpacerPx(containerHeight: number, lineEstimatePx = 64): number {
  if (containerHeight <= 0) return 120
  return Math.max(96, Math.round(containerHeight / 2 - lineEstimatePx / 2))
}
