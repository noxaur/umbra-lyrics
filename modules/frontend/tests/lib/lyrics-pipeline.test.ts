import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import { lyricsTextLooksLikeJunk } from "@/lib/sanitize-lyrics"

const FIXTURES = join(import.meta.dirname, "../../../../tests/fixtures")

type ReferenceTrack = {
  videoId: string
  minLines: number
  mustContain: string[]
  mustNotContain: string[]
}

type ReferenceResponses = Record<
  string,
  { plainLyrics: string | null; syncedLyrics: string | null }
>

const referenceTracks = JSON.parse(
  readFileSync(join(FIXTURES, "reference-tracks.json"), "utf8"),
) as ReferenceTrack[]

const referenceResponses = JSON.parse(
  readFileSync(join(FIXTURES, "lyrics-pipeline/reference-responses.json"), "utf8"),
) as ReferenceResponses

describe("lyrics pipeline reference tracks", () => {
  for (const track of referenceTracks) {
    it(`cleans and parses ${track.videoId}`, () => {
      const response = referenceResponses[track.videoId]
      expect(response).toBeDefined()

      const syncedRaw = response.syncedLyrics?.trim()
        ? prepareLyricsText(response.syncedLyrics)
        : null
      const plainRaw = response.plainLyrics?.trim()
        ? prepareLyricsText(response.plainLyrics)
        : null

      const parsed = syncedRaw
        ? parseLrc(syncedRaw, 240_000)
        : plainRaw
          ? parsePlainLyrics(plainRaw, 240_000)
          : { lines: [], synced: false }

      const displayText = parsed.lines.map((line) => line.text).join("\n")

      expect(parsed.lines.length).toBeGreaterThanOrEqual(track.minLines)
      expect(lyricsTextLooksLikeJunk(displayText)).toBe(false)

      for (const snippet of track.mustContain) {
        expect(displayText.toLowerCase()).toContain(snippet.toLowerCase())
      }

      for (const junk of track.mustNotContain) {
        expect(displayText).not.toContain(junk)
      }
    })
  }
})
