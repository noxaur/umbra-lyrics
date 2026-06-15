import type { LyricLine, LyricStageState } from "@/types/lyrics"
import {
  getFirstLyricStartMs,
  getLastLyricEndMs,
  isInGap,
} from "@/lib/gap-detection"

export {
  canAutoTimePlainLyrics,
  estimateLineWeight,
  estimatePlainLyricsTiming,
  type PlainLyricsTimingOptions,
  type PlainTimingOptions,
} from "@/lib/plain-lyrics-timing"

export { capLineEndTimes, GAP_THRESHOLD_MS } from "@/lib/gap-detection"
export { alignLinesToWords, parseEnhancedLrcWords } from "@/lib/word-alignment"

export function getActiveLineIndex(
  lines: LyricLine[],
  timeMs: number,
  offsetMs: number,
): number {
  const t = timeMs + offsetMs
  if (lines.length === 0) return -1

  const firstStart = getFirstLyricStartMs(lines)
  if (firstStart === null || t < firstStart) return -1

  if (isInGap(lines, t)) return -1

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

  if (line.words && line.words.length > 0) {
    const { progress } = getWordProgressDetailed(line, timeMs)
    return progress
  }

  const duration = line.endMs - line.startMs
  if (duration <= 0) return 0
  const progress = (timeMs - line.startMs) / duration
  return Math.min(1, Math.max(0, progress))
}

export function getWordProgressDetailed(
  line: LyricLine,
  timeMs: number,
): { wordIndex: number; progress: number } {
  if (line.kind === "section" || !line.text.trim()) {
    return { wordIndex: -1, progress: 0 }
  }

  if (line.words && line.words.length > 0) {
    for (let i = 0; i < line.words.length; i++) {
      const w = line.words[i]
      if (timeMs < w.startMs) return { wordIndex: Math.max(0, i - 1), progress: 0 }
      if (timeMs >= w.startMs && timeMs < w.endMs) {
        const dur = w.endMs - w.startMs
        const p = dur > 0 ? (timeMs - w.startMs) / dur : 1
        return { wordIndex: i, progress: Math.min(1, Math.max(0, p)) }
      }
    }
    return { wordIndex: line.words.length - 1, progress: 1 }
  }

  const duration = line.endMs - line.startMs
  if (duration <= 0) return { wordIndex: 0, progress: 0 }
  const progress = (timeMs - line.startMs) / duration
  return { wordIndex: 0, progress: Math.min(1, Math.max(0, progress)) }
}

export function getLyricStageState(
  lines: LyricLine[],
  timeMs: number,
  offsetMs: number,
  durationMs = 0,
): LyricStageState {
  const t = timeMs + offsetMs

  if (lines.length === 0) {
    return { mode: "idle", activeIndex: -1, wordIndex: -1, wordProgress: 0 }
  }

  const firstStart = getFirstLyricStartMs(lines)
  if (firstStart !== null && t < firstStart) {
    return { mode: "intro", activeIndex: -1, gapLabel: "♪ Intro ♪", wordIndex: -1, wordProgress: 0 }
  }

  if (isInGap(lines, t)) {
    return { mode: "gap", activeIndex: -1, gapLabel: "♪ Instrumental ♪", wordIndex: -1, wordProgress: 0 }
  }

  const lastEnd = getLastLyricEndMs(lines)
  if (lastEnd !== null && durationMs > 0 && t >= lastEnd && durationMs - t < 15000) {
    return { mode: "outro", activeIndex: -1, gapLabel: "♪ Outro ♪", wordIndex: -1, wordProgress: 0 }
  }

  const activeIndex = getActiveLineIndex(lines, timeMs, offsetMs)
  if (activeIndex < 0) {
    return { mode: "idle", activeIndex: -1, wordIndex: -1, wordProgress: 0 }
  }

  const line = lines[activeIndex]
  const { wordIndex, progress } = getWordProgressDetailed(line, t)
  return { mode: "lyric", activeIndex, wordIndex, wordProgress: progress }
}
