import type { LyricLine } from "@/types/lyrics"

export const GAP_THRESHOLD_MS = 8000
export const MAX_SINGABLE_MS = 6000

/** Cap lyric line end times so long instrumental gaps don't cause slow wipes. */
export function capLineEndTimes(lines: LyricLine[]): LyricLine[] {
  return lines.map((line, i) => {
    if (line.kind === "section" || !line.text.trim()) return line

    const next = lines[i + 1]
    if (!next) return line

    const gap = next.startMs - line.startMs
    const naturalEnd = next.startMs
    if (gap <= GAP_THRESHOLD_MS) {
      return { ...line, endMs: naturalEnd }
    }

    const cappedEnd = line.startMs + Math.min(gap * 0.4, MAX_SINGABLE_MS)
    return { ...line, endMs: Math.max(cappedEnd, line.startMs + 1500) }
  })
}

export function findGapAfterLine(lines: LyricLine[], lineIndex: number): number | null {
  const line = lines[lineIndex]
  const next = lines[lineIndex + 1]
  if (!line || !next || line.kind === "section") return null

  const gapStart = line.endMs
  const gapEnd = next.startMs
  const gapMs = gapEnd - gapStart
  if (gapMs >= GAP_THRESHOLD_MS) return gapMs
  return null
}

export function isInGap(lines: LyricLine[], timeMs: number): boolean {
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    const next = lines[i + 1]
    if (line.kind === "section" || !line.text.trim()) continue
    const gapStart = line.endMs
    const gapEnd = next.startMs
    if (gapEnd - gapStart >= GAP_THRESHOLD_MS && timeMs >= gapStart && timeMs < gapEnd) {
      return true
    }
  }
  return false
}

export function getFirstLyricStartMs(lines: LyricLine[]): number | null {
  for (const line of lines) {
    if (line.kind !== "section" && line.text.trim()) return line.startMs
  }
  return null
}

export function getLastLyricEndMs(lines: LyricLine[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line.kind !== "section" && line.text.trim()) return line.endMs
  }
  return null
}
