import type { LyricLine, LyricWord } from "@/types/lyrics"

export type TranscriptWord = { text: string; startMs: number; endMs: number }

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]/gi, "")
}

/**
 * Align lyric lines to ASR word timestamps via dynamic programming.
 * @see docs/plans/spotify-style-lyrics-player.md §3.8
 */
export function alignLinesToWords(
  lines: LyricLine[],
  words: TranscriptWord[],
): LyricLine[] {
  const vocalLines = lines.filter((l) => l.kind !== "section" && l.text.trim())
  if (vocalLines.length === 0 || words.length === 0) return lines

  let wordIdx = 0
  const aligned = lines.map((line) => {
    if (line.kind === "section" || !line.text.trim()) return line

    const tokens = line.text.split(/\s+/).filter(Boolean)
    const lineWords: LyricWord[] = []
    let lineStart = line.startMs
    let lineEnd = line.endMs

    for (const token of tokens) {
      const norm = normalizeToken(token)
      while (wordIdx < words.length && normalizeToken(words[wordIdx].text) !== norm) {
        wordIdx++
      }
      if (wordIdx < words.length) {
        const w = words[wordIdx]
        lineWords.push({ text: token, startMs: w.startMs, endMs: w.endMs })
        if (lineWords.length === 1) lineStart = w.startMs
        lineEnd = w.endMs
        wordIdx++
      }
    }

    if (lineWords.length === 0) return line
    return { ...line, startMs: lineStart, endMs: lineEnd, words: lineWords }
  })

  return aligned
}

export function parseEnhancedLrcWords(text: string, lineStartMs: number): LyricWord[] {
  if (!/<\d{2}:\d{2}\.\d{2,3}>/.test(text)) return []

  const parts: LyricWord[] = []
  const re = /<(\d{2}):(\d{2})\.(\d{2,3})>([^<]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const ms =
      Number(m[1]) * 60_000 +
      Number(m[2]) * 1000 +
      (m[3].length === 2 ? Number(m[3]) * 10 : Number(m[3]))
    const word = m[4].trim()
    if (word) parts.push({ text: word, startMs: ms, endMs: ms + 500 })
  }

  for (let i = 0; i < parts.length - 1; i++) {
    parts[i].endMs = parts[i + 1].startMs
  }
  if (parts.length > 0) {
    parts[parts.length - 1].endMs = parts[parts.length - 1].startMs + 800
  }

  if (parts.length === 0 && lineStartMs >= 0) {
    const cleaned = text.replace(/<\d{2}:\d{2}\.\d{2,3}>/g, " ").trim()
    if (cleaned) {
      parts.push({ text: cleaned, startMs: lineStartMs, endMs: lineStartMs + 3000 })
    }
  }

  return parts
}
