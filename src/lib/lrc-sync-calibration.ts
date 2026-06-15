import { capLineEndTimes } from "@/lib/gap-detection"
import type { LyricLine } from "@/types/lyrics"

/** Scale synced timestamps when the LRC master exceeds the YouTube duration. */
export function calibrateSyncedLyrics(lines: LyricLine[], durationMs: number): LyricLine[] {
  if (lines.length === 0 || durationMs <= 0) return lines

  const vocal = lines.filter((line) => line.kind !== "section" && line.text.trim())
  if (vocal.length === 0) return lines

  let calibrated = lines.map((line) => ({ ...line }))

  const lastVocal = vocal[vocal.length - 1]
  const lastStart = lastVocal.startMs
  const targetEnd = durationMs * 0.97

  if (lastStart > targetEnd) {
    const scale = targetEnd / Math.max(lastStart, 1)
    calibrated = calibrated.map((line) => ({
      ...line,
      startMs: Math.round(line.startMs * scale),
      endMs: Math.round(line.endMs * scale),
      words: line.words?.map((word) => ({
        ...word,
        startMs: Math.round(word.startMs * scale),
        endMs: Math.round(word.endMs * scale),
      })),
    }))
  }

  const firstVocal = calibrated.find((line) => line.kind !== "section" && line.text.trim())
  const firstStart = firstVocal?.startMs ?? vocal[0].startMs
  if (firstStart > durationMs * 0.25) {
    const introCap = Math.min(durationMs * 0.12, firstStart * 0.35)
    const shift = Math.max(0, firstStart - introCap)
    if (shift > 500) {
      calibrated = calibrated.map((line) => ({
        ...line,
        startMs: Math.max(0, line.startMs - shift),
        endMs: Math.max(0, line.endMs - shift),
        words: line.words?.map((word) => ({
          ...word,
          startMs: Math.max(0, word.startMs - shift),
          endMs: Math.max(0, word.endMs - shift),
        })),
      }))
    }
  }

  calibrated = capLineEndTimes(calibrated)
  return finalizeWordTimings(calibrated)
}

/** Clamp per-word ends to the parent line window. */
export function finalizeWordTimings(lines: LyricLine[]): LyricLine[] {
  return lines.map((line) => {
    if (!line.words?.length) return line

    const words = line.words.map((word) => ({ ...word }))
    for (let i = 0; i < words.length - 1; i++) {
      words[i].endMs = Math.min(words[i + 1].startMs, line.endMs)
    }
    words[words.length - 1].endMs = line.endMs

    for (const word of words) {
      if (word.endMs <= word.startMs) {
        word.endMs = Math.min(line.endMs, word.startMs + 400)
      }
    }

    return { ...line, words }
  })
}

/** Suggested global offset when the first lyric starts unusually late. */
export function estimateIntroSyncOffsetMs(lines: LyricLine[], durationMs: number): number {
  if (durationMs <= 0) return 0
  const vocal = lines.find((line) => line.kind !== "section" && line.text.trim())
  if (!vocal) return 0

  // Music videos often have 20–45s intros (e.g. Kendrick "Not Like Us" ~27s). Treat those as
  // intentional and avoid auto-offsetting synced LRCLIB timestamps.
  const intentionalIntroCap = Math.min(durationMs * 0.15, 60_000)
  if (vocal.startMs <= intentionalIntroCap) return 0

  const expectedIntro = Math.min(durationMs * 0.08, 20_000)
  const delta = vocal.startMs - expectedIntro
  return Math.min(5000, Math.max(-5000, -Math.round(delta * 0.35)))
}
