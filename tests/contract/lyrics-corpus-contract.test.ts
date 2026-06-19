import { describe, expect, it } from "vite-plus/test"
import scraperJunk from "../fixtures/lyrics-quality/scraper-junk.txt?raw"
import lyricsCases from "../fixtures/lyrics-cases.json"
import referenceTracks from "../fixtures/reference-tracks.json"

describe("lyrics baseline corpus", () => {
  it("preserves the original six reference tracks", () => {
    expect(referenceTracks.map((track) => track.videoId)).toEqual([
      "Ktk_EDLDPeY",
      "fJ9rUzIMcZQ",
      "kXYiU_JCYtU",
      "kJQP7kiw5Fk",
      "9bZkp7q19f0",
      "dQw4w9WgXcQ",
    ])
  })

  it("covers every required failure and multilingual category", () => {
    expect(new Set(lyricsCases.map((fixture) => fixture.category))).toEqual(
      new Set([
        "unavailable_video",
        "wrong_metadata",
        "no_lyrics",
        "instrumental",
        "scraper_junk",
        "non_english_output",
      ]),
    )
  })

  it("records provenance, capture date, mode, and terminal expectations", () => {
    for (const fixture of lyricsCases) {
      expect(fixture.id).toBeTruthy()
      expect(fixture.expectedOutcome).toMatch(/^(found|not_found|instrumental|error)$/)
      expect(fixture.mode).toMatch(/^(deterministic|live|both)$/)
      expect(fixture.provenance).toBeTruthy()
      expect(fixture.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(fixture.assertions).toBeTypeOf("object")
    }
  })

  it("reuses the checked-in scraper junk fixture", () => {
    const fixture = lyricsCases.find((candidate) => candidate.category === "scraper_junk")
    expect(fixture).toBeDefined()

    expect(fixture?.fixturePath).toBe("tests/fixtures/lyrics-quality/scraper-junk.txt")
    expect(scraperJunk.trim().length).toBeGreaterThan(0)
    expect(
      fixture?.assertions.forbiddenMarkers?.some((marker) =>
        scraperJunk.toLowerCase().includes(marker.toLowerCase()),
      ),
    ).toBe(true)
  })
})
