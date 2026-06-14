import type { LyricLine, ParsedLyrics } from "@/types/lyrics"

const LRC_LINE = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/

function parseTimestamp(min: string, sec: string, frac: string): number {
  const ms = frac.length === 2 ? Number(frac) * 10 : Number(frac)
  return Number(min) * 60_000 + Number(sec) * 1000 + ms
}

export function parseLrc(lrc: string, durationMs = 0): ParsedLyrics {
  const rawLines = lrc
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const lines: LyricLine[] = []

  for (const line of rawLines) {
    const match = line.match(LRC_LINE)
    if (!match) continue
    const [, min, sec, frac, text] = match
    lines.push({
      startMs: parseTimestamp(min, sec, frac),
      endMs: 0,
      text: text.trim(),
    })
  }

  lines.sort((a, b) => a.startMs - b.startMs)

  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1]
    lines[i].endMs = next ? next.startMs : durationMs > 0 ? durationMs : lines[i].startMs + 5000
  }

  return { lines, synced: lines.length > 0 }
}

export function parsePlainLyrics(text: string, durationMs: number): ParsedLyrics {
  const texts = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  if (texts.length === 0) return { lines: [], synced: false }

  const slice = durationMs / texts.length
  const lines: LyricLine[] = texts.map((t, i) => ({
    startMs: Math.round(i * slice),
    endMs: Math.round((i + 1) * slice),
    text: t,
  }))

  return { lines, synced: false }
}
