/** Typical lyric line height (~primary size + vertical padding). */
export const DEFAULT_LYRIC_LINE_HEIGHT_PX = 44

/** Half-viewport minus half a line — lets first/last lyrics sit at stage center (handoff v3). */
export function stageEdgeSpacerPx(
  containerHeight: number,
  lineHeightPx = DEFAULT_LYRIC_LINE_HEIGHT_PX,
): number {
  if (containerHeight <= 0) return 120
  const halfLine = lineHeightPx / 2
  return Math.max(0, Math.round(containerHeight / 2 - halfLine))
}
