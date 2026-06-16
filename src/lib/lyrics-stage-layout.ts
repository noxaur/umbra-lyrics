/** Half-viewport minus ~one line — lets first/last lyrics sit at stage center (handoff v3). */
export function stageEdgeSpacerPx(containerHeight: number): number {
  if (containerHeight <= 0) return 120
  return Math.max(96, Math.round(containerHeight / 2 - 32))
}
