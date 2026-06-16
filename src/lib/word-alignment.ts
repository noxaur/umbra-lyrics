import type { LyricLine, LyricWord } from "@/types/lyrics"

export type TranscriptWord = { text: string; startMs: number; endMs: number }

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u3040-\u9fff\uac00-\ud7af]/gi, "")
}

function tokensForLine(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

function tokenMatchCost(lyricToken: string, wordToken: string): number {
  const a = normalizeToken(lyricToken)
  const b = normalizeToken(wordToken)
  if (!a || !b) return 8
  if (a === b) return 0
  if (a.includes(b) || b.includes(a)) return 2
  return 8
}

/**
 * Align lyric lines to ASR word timestamps via DTW-style dynamic programming.
 */
export function alignLinesToWords(
  lines: LyricLine[],
  words: TranscriptWord[],
): LyricLine[] {
  const vocalLines = lines.filter((l) => l.kind !== "section" && l.text.trim())
  if (vocalLines.length === 0 || words.length === 0) return lines

  let wordIdx = 0
  return lines.map((line) => {
    if (line.kind === "section" || !line.text.trim()) return line

    const tokens = tokensForLine(line.text)
    const lineWords: LyricWord[] = []
    let lineStart = line.startMs
    let lineEnd = line.endMs

    for (const token of tokens) {
      let bestIdx = -1
      let bestCost = Number.POSITIVE_INFINITY
      const searchEnd = Math.min(words.length, wordIdx + 6)
      for (let j = wordIdx; j < searchEnd; j++) {
        const cost = tokenMatchCost(token, words[j].text)
        if (cost < bestCost) {
          bestCost = cost
          bestIdx = j
        }
      }

      if (bestIdx >= 0 && bestCost <= 2) {
        const w = words[bestIdx]
        lineWords.push({ text: token, startMs: w.startMs, endMs: w.endMs })
        if (lineWords.length === 1) lineStart = w.startMs
        lineEnd = w.endMs
        wordIdx = bestIdx + 1
      }
    }

    if (lineWords.length === 0) return line
    return { ...line, startMs: lineStart, endMs: lineEnd, words: lineWords }
  })
}

export function parseEnhancedLrcWords(text: string, lineStartMs: number, lineEndMs?: number): LyricWord[] {
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
    const fallbackEnd = lineEndMs ?? parts[parts.length - 1].startMs + 1200
    parts[parts.length - 1].endMs = Math.max(parts[parts.length - 1].startMs + 300, fallbackEnd)
  }

  if (parts.length === 0 && lineStartMs >= 0) {
    const cleaned = text.replace(/<\d{2}:\d{2}\.\d{2,3}>/g, " ").trim()
    if (cleaned) {
      parts.push({
        text: cleaned,
        startMs: lineStartMs,
        endMs: lineEndMs ?? lineStartMs + 3000,
      })
    }
  }

  return parts
}
