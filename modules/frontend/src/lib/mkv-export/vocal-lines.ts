import type { LyricLine } from "@/types/lyrics"
import type { VocalLineTiming } from "@/lib/mkv-export/types"

/** Sung lyric lines only (excludes standalone section markers). */
export function getVocalLines(lines: LyricLine[]): VocalLineTiming[] {
  const vocal: VocalLineTiming[] = []
  let vocalIndex = 0

  for (const line of lines) {
    if (line.kind === "section" || !line.text.trim()) continue
    vocal.push({
      index: vocalIndex,
      startMs: line.startMs,
      endMs: line.endMs,
      text: line.text.trim(),
    })
    vocalIndex += 1
  }

  return vocal
}
