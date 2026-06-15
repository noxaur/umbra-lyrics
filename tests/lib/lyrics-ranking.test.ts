import { describe, expect, it } from "vitest"
import {
  countLyricLines,
  pickBestAndAlternates,
  rankLyricsCandidate,
  RANK_WEIGHTS,
} from "@/lib/lyrics-ranking"
import type { ProviderLyricsCandidate } from "@/lib/lyrics-providers/types"

function candidate(
  overrides: Partial<ProviderLyricsCandidate> & Pick<ProviderLyricsCandidate, "providerId">,
): ProviderLyricsCandidate {
  return {
    externalId: "1",
    trackName: "Song",
    artistName: "Artist",
    plainLyrics: "Line one\nLine two\nLine three\nLine four",
    syncedLyrics: null,
    synced: false,
    confidence: 10,
    duration: 180,
    ...overrides,
  }
}

const rankContext = {
  durationSec: 181,
  artist: "Artist",
  track: "Song",
  preferredLanguage: "eng",
  providerPriority: (id: string) =>
    ({ lrclib: 1, musicbrainz: 2, "lyrics-ovh": 3, megalobiz: 4 })[id] ?? 99,
}

describe("lyrics-ranking", () => {
  it("prefers synced LRC over plain text from another provider", () => {
    const plainOvh = candidate({
      providerId: "lyrics-ovh",
      synced: false,
      confidence: 0,
      plainLyrics: "One\nTwo\nThree\nFour\nFive",
    })
    const syncedLrc = candidate({
      providerId: "lrclib",
      synced: true,
      syncedLyrics: "[00:00.00] One\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four",
      plainLyrics: null,
      confidence: 20,
    })

    const { best } = pickBestAndAlternates([plainOvh, syncedLrc], rankContext)
    expect(best?.candidate.providerId).toBe("lrclib")
    expect(best?.candidate.synced).toBe(true)
  })

  it("prefers lrclib synced over megalobiz synced when match confidence is similar", () => {
    const megalobiz = candidate({
      providerId: "megalobiz",
      externalId: "m1",
      synced: true,
      syncedLyrics: "[00:00.00] A\n[00:01.00] B\n[00:02.00] C\n[00:03.00] D",
      confidence: 5,
    })
    const lrclib = candidate({
      providerId: "lrclib",
      externalId: 1,
      synced: true,
      syncedLyrics: "[00:00.00] A\n[00:01.00] B\n[00:02.00] C\n[00:03.00] D",
      confidence: 8,
    })

    expect(rankLyricsCandidate(lrclib, rankContext)).toBeLessThan(
      rankLyricsCandidate(megalobiz, rankContext),
    )
  })

  it("penalizes instrumental and prefers vocal match", () => {
    const vocal = candidate({
      providerId: "lrclib",
      instrumental: false,
      duration: 181,
    })
    const instrumental = candidate({
      providerId: "lrclib",
      externalId: 2,
      instrumental: true,
      plainLyrics: "Inst line\nTwo\nThree\nFour",
    })

    const { best } = pickBestAndAlternates([instrumental, vocal], rankContext)
    expect(best?.candidate.instrumental).toBeFalsy()
    expect(best?.candidate.externalId).toBe(vocal.externalId)
  })

  it("penalizes low line count and short text", () => {
    const full = candidate({ providerId: "lrclib", plainLyrics: "A\nB\nC\nD\nE\nF\nG\nH" })
    const snippet = candidate({
      providerId: "lyrics-ovh",
      externalId: "s",
      plainLyrics: "Hi",
    })

    expect(rankLyricsCandidate(full, rankContext)).toBeLessThan(
      rankLyricsCandidate(snippet, rankContext),
    )
    expect(countLyricLines(snippet)).toBe(1)
  })

  it("returns alternates ranked after best pick", () => {
    const best = candidate({
      providerId: "lrclib",
      synced: true,
      syncedLyrics: "[00:00.00] A\n[00:01.00] B\n[00:02.00] C\n[00:03.00] D",
      confidence: 0,
    })
    const second = candidate({
      providerId: "lyrics-ovh",
      externalId: "o1",
      confidence: 50,
    })
    const third = candidate({
      providerId: "megalobiz",
      externalId: "m1",
      confidence: 80,
      plainLyrics: "X\nY\nZ\nW",
    })

    const { best: picked, alternates } = pickBestAndAlternates([third, second, best], rankContext)
    expect(picked?.candidate.providerId).toBe("lrclib")
    expect(alternates).toHaveLength(2)
    expect(alternates[0].score).toBeLessThanOrEqual(alternates[1].score)
  })

  it("penalizes language mismatch for Japanese metadata", () => {
    const english = candidate({
      providerId: "aggregated-scraper",
      externalId: "swim",
      trackName: "Swim",
      artistName: "Kitri",
      plainLyrics: "Swim, swim\nWater falling off your skin\nLine three\nLine four",
    })
    const japanese = candidate({
      providerId: "lrclib",
      externalId: 2,
      trackName: "別世界",
      artistName: "天音かなた",
      plainLyrics: "作詞の空白を埋めるみたいに\n遠い遠い別世界まで\nLine three\nLine four",
    })

    const jpContext = {
      ...rankContext,
      artist: "天音かなた",
      track: "別世界",
      preferredLanguage: "ja" as const,
    }

    expect(rankLyricsCandidate(japanese, jpContext)).toBeLessThan(
      rankLyricsCandidate(english, jpContext),
    )
  })

  it("documents weight constants for plain-not-synced penalty", () => {
    expect(RANK_WEIGHTS.PLAIN_NOT_SYNCED).toBe(500)
    expect(RANK_WEIGHTS.PROVIDER_PRIORITY_MULT).toBe(10)
  })
})
