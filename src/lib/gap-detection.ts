import type { LyricLine } from "@/types/lyrics"

/** Gaps at or above this are treated as instrumental breaks. */
export const GAP_THRESHOLD_MS = 4000
/** Short pauses between lines — hold the previous lyric instead of going idle. */
export const SOFT_GAP_HOLD_MS = 2500
/** Gaps above this get line end times capped so wipes don't drag. */
export const CAP_GAP_THRESHOLD_MS = 2500
export const MAX_SINGABLE_MS = 5500

function isVocalLine(line: LyricLine | undefined): line is LyricLine {
  return Boolean(line && line.kind !== "section" && line.text.trim())
}

function gapBetween(lines: LyricLine[], index: number): number | null {
  const line = lines[index]
  const next = lines[index + 1]
  if (!isVocalLine(line) || !next) return null
  const gapStart = line.endMs
  const gapEnd = next.startMs
  const gapMs = gapEnd - gapStart
  return gapMs > 0 ? gapMs : null
}

/** Cap lyric line end times so instrumental gaps don't cause slow wipes. */
export function capLineEndTimes(lines: LyricLine[]): LyricLine[] {
  return lines.map((line, i) => {
    if (line.kind === "section" || !line.text.trim()) return line

    const gap = gapBetween(lines, i)
    if (gap === null) return line

    const naturalEnd = lines[i + 1].startMs
    if (gap <= CAP_GAP_THRESHOLD_MS) {
      return { ...line, endMs: naturalEnd }
    }

    const cappedEnd = line.startMs + Math.min(gap * 0.45, MAX_SINGABLE_MS)
    return { ...line, endMs: Math.max(cappedEnd, line.startMs + 1200) }
  })
}

export function findGapAfterLine(lines: LyricLine[], lineIndex: number): number | null {
  const gap = gapBetween(lines, lineIndex)
  if (gap === null || gap < GAP_THRESHOLD_MS) return null
  return gap
}

export function isInGap(lines: LyricLine[], timeMs: number): boolean {
  for (let i = 0; i < lines.length - 1; i++) {
    const gap = gapBetween(lines, i)
    if (gap === null || gap < GAP_THRESHOLD_MS) continue
    const gapStart = lines[i].endMs
    const gapEnd = lines[i + 1].startMs
    if (timeMs >= gapStart && timeMs < gapEnd) return true
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
