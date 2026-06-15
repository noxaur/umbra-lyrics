import { canAutoTimePlainLyrics, estimatePlainLyricsTiming } from "@/lib/plain-lyrics-timing"
import { parseLyricStructureTags } from "@/lib/lyric-structure"
import type { LyricLine, ParsedLyrics } from "@/types/lyrics"

const LRC_LINE = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/

export type LyricsParseOptions = {
  /** Show standalone structure tags as muted section labels (default true) */
  showSectionLabels?: boolean
}

function parseTimestamp(min: string, sec: string, frac: string): number {
  const ms = frac.length === 2 ? Number(frac) * 10 : Number(frac)
  return Number(min) * 60_000 + Number(sec) * 1000 + ms
}

function applyStructureToLrcText(
  text: string,
  startMs: number,
  endMs: number,
  showSectionLabels: boolean,
): LyricLine[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const parsed = parseLyricStructureTags(trimmed)
  if (parsed.length === 1) {
    const line = parsed[0]
    if (line.isStructureOnly) {
      if (!showSectionLabels || !line.sectionLabel) return []
      return [
        {
          startMs,
          endMs: startMs,
          text: "",
          sectionLabel: line.sectionLabel,
          kind: "section",
        },
      ]
    }
    return [
      {
        startMs,
        endMs,
        text: line.text.trim(),
        sectionLabel: line.sectionLabel,
        kind: "lyric",
      },
    ]
  }

  return [{ startMs, endMs, text: trimmed, kind: "lyric" }]
}

export function parseLrc(
  lrc: string,
  durationMs = 0,
  options: LyricsParseOptions = {},
): ParsedLyrics {
  const showSectionLabels = options.showSectionLabels ?? true
  const rawLines = lrc
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const lines: LyricLine[] = []

  for (const line of rawLines) {
    const match = line.match(LRC_LINE)
    if (!match) continue
    const [, min, sec, frac, text] = match
    const startMs = parseTimestamp(min, sec, frac)
    lines.push(
      ...applyStructureToLrcText(text, startMs, 0, showSectionLabels).map((l) => ({
        ...l,
        endMs: 0,
      })),
    )
  }

  lines.sort((a, b) => a.startMs - b.startMs)

  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1]
    if (lines[i].kind === "section") {
      lines[i].endMs = lines[i].startMs
    } else {
      lines[i].endMs = next ? next.startMs : durationMs > 0 ? durationMs : lines[i].startMs + 5000
    }
  }

  return { lines, synced: lines.length > 0, autoTimed: false }
}

export function parsePlainLyrics(
  text: string,
  durationMs: number,
  options: LyricsParseOptions = {},
): ParsedLyrics {
  const showSectionLabels = options.showSectionLabels ?? true
  const structured = parseLyricStructureTags(text)

  if (structured.every((l) => !l.text.trim() && l.isStructureOnly && !showSectionLabels)) {
    return { lines: [], synced: false, autoTimed: false }
  }

  if (structured.every((l) => !l.text.trim() && !l.isStructureOnly)) {
    return { lines: [], synced: false, autoTimed: false }
  }

  const durationSec = durationMs / 1000
  if (canAutoTimePlainLyrics(durationSec)) {
    const lines = estimatePlainLyricsTiming(structured, durationSec, { showSectionLabels })
    return { lines, synced: false, autoTimed: true }
  }

  const vocalOnly = structured.filter((l) => !l.isStructureOnly && l.text.trim())
  const slice = vocalOnly.length > 0 ? durationMs / vocalOnly.length : 0
  const lines: LyricLine[] = []
  let vocalIdx = 0

  for (const line of structured) {
    if (line.isStructureOnly) {
      if (showSectionLabels && line.sectionLabel) {
        const at = Math.round(vocalIdx * slice)
        lines.push({
          startMs: at,
          endMs: at,
          text: "",
          sectionLabel: line.sectionLabel,
          kind: "section",
        })
      }
      continue
    }

    const trimmed = line.text.trim()
    if (!trimmed) continue

    const startMs = Math.round(vocalIdx * slice)
    vocalIdx++
    lines.push({
      startMs,
      endMs: Math.round(vocalIdx * slice),
      text: trimmed,
      sectionLabel: line.sectionLabel,
      kind: "lyric",
    })
  }

  return { lines, synced: false, autoTimed: false }
}

export { parseLyricStructureTags } from "@/lib/lyric-structure"
