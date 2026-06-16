import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import { getActiveLineIndex, getWordProgress } from "@/lib/sync-engine"

const FIXTURES = join(import.meta.dirname, "../fixtures/lyrics-pipeline/reference-responses.json")
const DURATION_MS = 240_000

type ReferenceResponses = Record<
  string,
  { plainLyrics: string | null; syncedLyrics: string | null }
>

const responses = JSON.parse(readFileSync(FIXTURES, "utf8")) as ReferenceResponses

function parseReference(videoId: string) {
  const response = responses[videoId]
  const syncedRaw = response.syncedLyrics?.trim()
    ? prepareLyricsText(response.syncedLyrics)
    : null
  const plainRaw = response.plainLyrics?.trim()
    ? prepareLyricsText(response.plainLyrics)
    : null

  if (syncedRaw) return parseLrc(syncedRaw, DURATION_MS)
  if (plainRaw) return parsePlainLyrics(plainRaw, DURATION_MS)
  throw new Error(`No lyrics for ${videoId}`)
}

describe("sync benchmark", () => {
  it("keeps synced reference lines monotonic and inside the track", () => {
    for (const videoId of ["fJ9rUzIMcZQ", "kXYiU_JCYtU", "dQw4w9WgXcQ"]) {
      const parsed = parseReference(videoId)
      expect(parsed.synced).toBe(true)
      for (let i = 1; i < parsed.lines.length; i++) {
        expect(parsed.lines[i].startMs).toBeGreaterThanOrEqual(parsed.lines[i - 1].startMs)
      }
      const last = parsed.lines[parsed.lines.length - 1]
      expect(last.endMs).toBeLessThanOrEqual(DURATION_MS)
    }
  })

  it("auto-timed plain lyrics cover at least 55% of the vocal window", () => {
    for (const videoId of ["Ktk_EDLDPeY", "kJQP7kiw5Fk", "9bZkp7q19f0"]) {
      const parsed = parseReference(videoId)
      expect(parsed.autoTimed).toBe(true)
      const vocal = parsed.lines.filter((line) => line.text.trim())
      const covered = vocal[vocal.length - 1].endMs - vocal[0].startMs
      expect(covered / DURATION_MS).toBeGreaterThan(0.55)
    }
  })

  it("holds the active line through short inter-line gaps", () => {
    const lines = [
      { startMs: 0, endMs: 5000, text: "First line" },
      { startMs: 6200, endMs: 9000, text: "Second line" },
    ]
    const holdTime = 5600
    expect(getActiveLineIndex(lines, holdTime, 0)).toBe(0)
    expect(getWordProgress(lines[0], holdTime)).toBe(1)
  })

  it("does not leave long instrumental gaps wiping slowly", () => {
    const lines = parseReference("fJ9rUzIMcZQ").lines
    for (let i = 0; i < lines.length - 1; i++) {
      const gap = lines[i + 1].startMs - lines[i].endMs
      if (gap > 4000) {
        expect(lines[i].endMs - lines[i].startMs).toBeLessThanOrEqual(7000)
      }
    }
  })
})
