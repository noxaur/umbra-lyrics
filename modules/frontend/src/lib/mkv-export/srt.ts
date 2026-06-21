import type { LyricLine } from "@/types/lyrics"
import { getVocalLines } from "@/lib/mkv-export/vocal-lines"

export function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, ms)
  const hours = Math.floor(clamped / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)
  const millis = clamped % 1000
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`
}

function escapeSrtText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
}

export function linesToSrt(
  lines: LyricLine[],
  syncOffsetMs: number,
  durationMs: number,
): string {
  const vocal = getVocalLines(lines)
  if (vocal.length === 0) return ""

  const blocks: string[] = []

  for (let i = 0; i < vocal.length; i++) {
    const line = vocal[i]
    const startMs = Math.max(0, line.startMs + syncOffsetMs)
    const nextStart = vocal[i + 1]?.startMs ?? durationMs
    const endMs = Math.max(startMs + 500, Math.min(line.endMs + syncOffsetMs, nextStart, durationMs))

    const text = escapeSrtText(line.text)
    if (!text) continue

    blocks.push(
      String(blocks.length + 1),
      `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}`,
      text,
      "",
    )
  }

  return blocks.join("\n")
}
