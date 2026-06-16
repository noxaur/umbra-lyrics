import { describe, expect, it } from "vitest"
import { buildSearchAttempts, dedupeAttempts } from "@/lib/lyrics-providers/search-attempts"

describe("buildSearchAttempts", () => {
  it("includes stripped and simplified track variants", () => {
    const attempts = buildSearchAttempts({
      track: "Despacito (feat. Daddy Yankee)",
      artist: "Luis Fonsi",
      canonicalTrack: "Despacito (feat. Daddy Yankee)",
      canonicalArtist: "Luis Fonsi",
      durationSec: 229,
    })

    expect(attempts.map((a) => a.track)).toEqual(
      expect.arrayContaining([
        "Despacito (feat. Daddy Yankee)",
        "Despacito",
        "Despacito (feat. Daddy Yankee)",
        "Despacito",
      ]),
    )
  })

  it("adds stripped and simplified alternates from metadata", () => {
    const attempts = buildSearchAttempts({
      track: "Song",
      artist: "Artist",
      durationSec: 200,
      metadataAlternates: [{ artist: "Alt Artist", track: "Song (Live)" }],
    })

    expect(attempts).toEqual(
      expect.arrayContaining([
        { artist: "Alt Artist", track: "Song (Live)" },
        { artist: "Alt Artist", track: "Song" },
      ]),
    )
    // simplifyTrackName does not strip "(Live)" — only stripDecorativeTitle does.
    expect(attempts.filter((a) => a.artist === "Alt Artist" && a.track === "Song (Live)").length).toBe(
      2,
    )
  })

  it("keeps stripped and simplified distinct for decorative-only suffixes", () => {
    const attempts = buildSearchAttempts({
      track: "別世界【MV】",
      artist: "天音かなた",
      durationSec: 246,
    })

    expect(attempts.map((a) => a.track)).toEqual(
      expect.arrayContaining(["別世界【MV】", "別世界"]),
    )
    expect(attempts.some((a) => a.track === "別世界【MV】")).toBe(true)
    expect(attempts.some((a) => a.track === "別世界")).toBe(true)
  })

  it("filters empty track attempts", () => {
    const attempts = buildSearchAttempts({
      track: "   ",
      artist: "Artist",
      durationSec: 200,
    })

    expect(attempts).toEqual([])
  })
})

describe("dedupeAttempts", () => {
  it("removes duplicate artist/track pairs", () => {
    const attempts = dedupeAttempts([
      { artist: "Artist", track: "Song" },
      { artist: "Artist", track: "Song" },
      { artist: "Artist", track: "Other" },
    ])

    expect(attempts).toEqual([
      { artist: "Artist", track: "Song" },
      { artist: "Artist", track: "Other" },
    ])
  })
})
