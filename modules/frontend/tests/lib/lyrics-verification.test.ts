import { describe, expect, it } from "vitest"
import {
  assessContentType,
  buildTranscriptProfile,
  shouldPromoteTranscription,
  verifyLyricsAgainstTranscript,
} from "@/lib/lyrics-verification"
import type { ProviderLyricsCandidate } from "@/lib/lyrics-providers/types"

const candidate = (plain: string): ProviderLyricsCandidate => ({
  providerId: "lrclib",
  externalId: 1,
  trackName: "Test",
  artistName: "Artist",
  plainLyrics: plain,
  syncedLyrics: null,
  synced: false,
  confidence: 0,
})

describe("lyrics-verification", () => {
  it("scores high when lyrics match transcript", () => {
    const profile = buildTranscriptProfile([
      { start: 0, end: 2, text: "never gonna give you up" },
      { start: 2.5, end: 5, text: "never gonna let you down" },
    ])

    const result = verifyLyricsAgainstTranscript(
      candidate("Never gonna give you up\nNever gonna let you down"),
      profile,
    )

    expect(result.score).toBeGreaterThan(0.35)
    expect(result.wordOverlap).toBeGreaterThan(0.2)
  })

  it("scores low for mismatched lyrics", () => {
    const profile = buildTranscriptProfile([
      { start: 0, end: 2, text: "completely different words here" },
    ])

    const result = verifyLyricsAgainstTranscript(
      candidate("Never gonna give you up"),
      profile,
    )

    expect(result.score).toBeLessThan(0.35)
  })

  it("detects speech-heavy content", () => {
    const profile = buildTranscriptProfile([
      { start: 0, end: 15, text: "welcome to my podcast today we discuss many topics" },
      { start: 16, end: 35, text: "and now let me tell you about this interesting subject" },
    ])

    const assessment = assessContentType(profile)
    expect(assessment.type).toBe("speech")
    expect(assessment.recommendTranscription).toBe(true)
  })

  it("promotes transcription when provider verification is weak", () => {
    const profile = buildTranscriptProfile([
      { start: 0, end: 2, text: "actual sung lyrics from audio" },
    ])
    const content = assessContentType(profile)

    expect(
      shouldPromoteTranscription({ score: 0.4, lineCoverage: 0.3, wordOverlap: 0.3, flags: [] }, profile, content),
    ).toBe(true)
    expect(
      shouldPromoteTranscription({ score: 0.7, lineCoverage: 0.8, wordOverlap: 0.8, flags: [] }, profile, content),
    ).toBe(false)
  })

  it("does not promote transcription for instrumental content", () => {
    const profile = buildTranscriptProfile([], { coverageSec: 120 })
    const content = assessContentType({ ...profile, vocalDensity: 0.02, coverageSec: 120 })

    expect(
      shouldPromoteTranscription({ score: 0.2, lineCoverage: 0, wordOverlap: 0, flags: [] }, profile, content),
    ).toBe(false)
  })
})
