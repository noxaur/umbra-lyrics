import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import referenceTracks from "../fixtures/reference-tracks.json"

const FIXTURES = join(import.meta.dirname, "../fixtures/lyrics-pipeline")
const responses = JSON.parse(
  readFileSync(join(FIXTURES, "reference-responses.json"), "utf8"),
) as Record<string, { plainLyrics: string | null }>

const runLive = process.env.RUN_LIVE_LYRICS === "1"

describe.runIf(runLive)("reference tracks live smoke", () => {
  for (const track of referenceTracks) {
    it(`fetches clean lyrics for ${track.videoId}`, async () => {
      const params = new URLSearchParams({
        artist: track.artist,
        track: track.track,
      })
      const res = await fetch(`https://lrclib.net/api/search?${params}`)
      expect(res.ok).toBe(true)
      const data = (await res.json()) as Array<{ plainLyrics?: string | null }>
      const hit = data.find((row) => row.plainLyrics?.trim())
      expect(hit?.plainLyrics?.trim().length ?? 0).toBeGreaterThan(0)
    }, 15_000)
  }
})

describe("reference track fixtures", () => {
  it("includes all six planned video ids", () => {
    expect(referenceTracks).toHaveLength(6)
    expect(referenceTracks.map((track) => track.videoId)).toEqual([
      "Ktk_EDLDPeY",
      "fJ9rUzIMcZQ",
      "kXYiU_JCYtU",
      "kJQP7kiw5Fk",
      "9bZkp7q19f0",
      "dQw4w9WgXcQ",
    ])
  })

  it("has pipeline responses for every reference track", () => {
    for (const track of referenceTracks) {
      expect(responses[track.videoId]?.plainLyrics).toBeTruthy()
    }
  })
})
