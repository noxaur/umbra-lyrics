import type { LyricLine } from "@/types/lyrics"

export {
  canAutoTimePlainLyrics,
  estimateLineWeight,
  estimatePlainLyricsTiming,
  type PlainLyricsTimingOptions,
  type PlainTimingOptions,
} from "@/lib/plain-lyrics-timing"

export function getActiveLineIndex(
  lines: LyricLine[],
  timeMs: number,
  offsetMs: number,
): number {
  const t = timeMs + offsetMs
  if (lines.length === 0 || t < lines[0].startMs) return -1

  let lo = 0
  let hi = lines.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].startMs <= t) lo = mid + 1
    else hi = mid - 1
  }

  let idx = lo - 1
  if (idx < 0) return -1

  while (idx >= 0 && !isHighlightableLine(lines[idx])) {
    idx--
  }
  if (idx < 0) return -1

  if (t >= lines[idx].startMs && t < lines[idx].endMs) return idx
  if (idx === lines.length - 1 && t >= lines[idx].startMs) return idx
  return -1
}

function isHighlightableLine(line: LyricLine): boolean {
  if (line.kind === "section") return false
  return line.text.trim().length > 0
}

export function getWordProgress(line: LyricLine, timeMs: number): number {
  if (line.kind === "section" || !line.text.trim()) return 0
  const duration = line.endMs - line.startMs
  if (duration <= 0) return 0
  const progress = (timeMs - line.startMs) / duration
  return Math.min(1, Math.max(0, progress))
}
