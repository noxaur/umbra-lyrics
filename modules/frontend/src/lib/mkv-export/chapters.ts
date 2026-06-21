import type { LyricLine } from "@/types/lyrics"
import { isInstrumentalSection } from "@/lib/lyric-structure"

export type ChapterMarker = {
  startMs: number
  title: string
}

const INTRO_THRESHOLD_MS = 3000

function chapterTitleForLine(line: LyricLine): string | null {
  if (line.kind === "section" && line.sectionLabel) {
    return line.sectionLabel
  }
  if (line.sectionLabel) {
    return line.sectionLabel
  }
  return null
}

export function buildChapterMarkers(
  lines: LyricLine[],
  syncOffsetMs: number,
  durationMs: number,
): ChapterMarker[] {
  const markers: ChapterMarker[] = []
  const seenTitles = new Set<string>()

  const vocalStart = lines.find((l) => l.kind !== "section" && l.text.trim())?.startMs
  if (vocalStart !== undefined && vocalStart + syncOffsetMs >= INTRO_THRESHOLD_MS) {
    markers.push({ startMs: 0, title: "Intro" })
    seenTitles.add("Intro")
  }

  for (const line of lines) {
    const title = chapterTitleForLine(line)
    if (!title || seenTitles.has(title)) continue

    const startMs = Math.max(0, line.startMs + syncOffsetMs)
    if (startMs >= durationMs) continue

    const displayTitle = isInstrumentalSection(title) ? title : title

    markers.push({ startMs, title: displayTitle })
    seenTitles.add(title)
  }

  if (markers.length === 0) {
    markers.push({ startMs: 0, title: "Start" })
  }

  markers.sort((a, b) => a.startMs - b.startMs)
  return markers
}

export function chaptersToFfmetadata(
  markers: ChapterMarker[],
  durationMs: number,
): string {
  const sorted = [...markers].sort((a, b) => a.startMs - b.startMs)
  const lines: string[] = [";FFMETADATA1"]

  for (let i = 0; i < sorted.length; i++) {
    const chapter = sorted[i]
    const nextStart = sorted[i + 1]?.startMs ?? durationMs
    const endMs = Math.max(chapter.startMs + 1, nextStart)

    lines.push("[CHAPTER]")
    lines.push("TIMEBASE=1/1000")
    lines.push(`START=${chapter.startMs}`)
    lines.push(`END=${endMs}`)
    lines.push(`title=${chapter.title}`)
  }

  return `${lines.join("\n")}\n`
}
