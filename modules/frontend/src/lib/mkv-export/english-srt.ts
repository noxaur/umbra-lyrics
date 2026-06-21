import type { LyricLine } from "@/types/lyrics"
import { formatSrtTimestamp } from "@/lib/mkv-export/srt"
import { getVocalLines } from "@/lib/mkv-export/vocal-lines"

export function englishLinesToSrt(
  nativeLines: LyricLine[],
  englishLines: string[],
  syncOffsetMs: number,
  durationMs: number,
): string {
  const vocal = getVocalLines(nativeLines)
  if (vocal.length === 0 || englishLines.length === 0) return ""

  const blocks: string[] = []

  for (let i = 0; i < vocal.length; i++) {
    const line = vocal[i]
    const english = englishLines[i]?.trim()
    if (!english) continue

    const startMs = Math.max(0, line.startMs + syncOffsetMs)
    const nextStart = vocal[i + 1]?.startMs ?? durationMs
    const endMs = Math.max(startMs + 500, Math.min(line.endMs + syncOffsetMs, nextStart, durationMs))

    blocks.push(
      String(blocks.length + 1),
      `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}`,
      english,
      "",
    )
  }

  return blocks.join("\n")
}
