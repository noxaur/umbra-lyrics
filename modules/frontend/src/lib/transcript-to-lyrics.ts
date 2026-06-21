import { calibrateSyncedLyrics } from "@/lib/lrc-sync-calibration"
import type { LyricLine, LyricWord, ParsedLyrics } from "@/types/lyrics"

export type TranscriptSegment = {
  start: number
  end: number
  text: string
}

const MAX_WORDS_PER_LINE = 10
const PAUSE_BREAK_SEC = 0.4

function distributeWordsInSegment(
  text: string,
  startMs: number,
  endMs: number,
): LyricWord[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const span = Math.max(endMs - startMs, tokens.length * 120)
  const step = span / tokens.length
  return tokens.map((token, i) => ({
    text: token,
    startMs: Math.round(startMs + i * step),
    endMs: Math.round(startMs + (i + 1) * step),
  }))
}

type LineBuild = {
  segments: TranscriptSegment[]
  words: LyricWord[]
}

function flushLine(build: LineBuild, lines: LineBuild[]): void {
  if (build.segments.length === 0) return
  lines.push(build)
}

/** Group Whisper segments into karaoke lines with per-word timing. */
export function groupSegmentsIntoLines(segments: TranscriptSegment[]): LineBuild[] {
  const lines: LineBuild[] = []
  let current: LineBuild = { segments: [], words: [] }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const startMs = Math.round(seg.start * 1000)
    const endMs = Math.round(Math.max(seg.end, seg.start + 0.05) * 1000)
    const segWords = distributeWordsInSegment(seg.text, startMs, endMs)

    const prev = segments[i - 1]
    const pause = prev ? seg.start - prev.end : 0
    const wouldOverflow =
      current.words.length > 0 &&
      current.words.length + segWords.length > MAX_WORDS_PER_LINE
    const pauseBreak = pause > PAUSE_BREAK_SEC

    if (current.segments.length > 0 && (wouldOverflow || pauseBreak)) {
      flushLine(current, lines)
      current = { segments: [], words: [] }
    }

    current.segments.push(seg)
    current.words.push(...segWords)
  }

  flushLine(current, lines)
  return lines
}

export function segmentsToLyricLines(
  segments: TranscriptSegment[],
  durationMs: number,
): ParsedLyrics {
  if (segments.length === 0 || durationMs <= 0) {
    return { lines: [], synced: false, aligned: false }
  }

  const grouped = groupSegmentsIntoLines(segments)
  const lines: LyricLine[] = grouped.map((group) => {
    const text = group.segments.map((s) => s.text).join(" ").trim()
    const startMs = group.words[0]?.startMs ?? Math.round(group.segments[0].start * 1000)
    const endMs =
      group.words[group.words.length - 1]?.endMs ??
      Math.round(group.segments[group.segments.length - 1].end * 1000)

    return {
      text,
      startMs,
      endMs: Math.max(endMs, startMs + 400),
      kind: "lyric" as const,
      words: group.words,
    }
  })

  const calibrated = calibrateSyncedLyrics(lines, durationMs)

  return {
    lines: calibrated,
    synced: true,
    aligned: true,
    autoTimed: false,
  }
}

export function transcriptToPlainLyrics(segments: TranscriptSegment[]): string {
  return groupSegmentsIntoLines(segments)
    .map((group) => group.segments.map((s) => s.text).join(" ").trim())
    .filter(Boolean)
    .join("\n")
}
