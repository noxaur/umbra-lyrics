import { describe, expect, it } from "vitest"
import {
  hasLyricsText,
  pickBestCandidate,
  rankHitScore,
  scoreCandidate,
} from "@/lib/lyrics-providers/match-utils"

describe("match-utils", () => {
  it("scores synced vocal match lower than instrumental", () => {
    const vocal = {
      trackName: "Song",
      artistName: "Artist",
      duration: 180,
      instrumental: false,
      plainLyrics: "line",
    }
    const instrumental = { ...vocal, instrumental: true, plainLyrics: null }
    expect(scoreCandidate(vocal, 181, "Artist")).toBeLessThan(
      scoreCandidate(instrumental, 181, "Artist"),
    )
  })

  it("prefers artist match over closer duration from wrong artist", () => {
    const results = [
      {
        trackName: "別世界",
        artistName: "Kitri",
        duration: 255,
        plainLyrics: "wrong",
      },
      {
        trackName: "別世界",
        artistName: "天音かなた",
        duration: 246,
        plainLyrics: "correct",
      },
    ]
    const best = pickBestCandidate(results, 255, "天音かなた", "別世界")
    expect(best?.artistName).toBe("天音かなた")
  })

  it("prefers track match over unrelated English hit", () => {
    const results = [
      {
        trackName: "Swim",
        artistName: "Kitri",
        duration: 246,
        plainLyrics: "Swim, swim\nWater falling off your skin",
      },
      {
        trackName: "別世界",
        artistName: "天音かなた",
        duration: 246,
        plainLyrics: "作詞の空白を埋めるみたいに",
      },
    ]
    const best = pickBestCandidate(results, 246, "天音かなた", "別世界")
    expect(best?.trackName).toBe("別世界")
  })

  it("ranks synced hits above plain text", () => {
    const synced = rankHitScore({ synced: true, confidence: 10, providerPriority: 2 })
    const plain = rankHitScore({ synced: false, confidence: 5, providerPriority: 1 })
    expect(synced).toBeLessThan(plain)
  })

  it("prefers synced when metadata and duration match", () => {
    const results = [
      {
        trackName: "Song",
        artistName: "Artist",
        duration: 181,
        plainLyrics: "line one",
        syncedLyrics: null,
      },
      {
        trackName: "Song",
        artistName: "Artist",
        duration: 181,
        plainLyrics: "line one",
        syncedLyrics: "[00:00.00] line one",
      },
    ]
    const best = pickBestCandidate(results, 181, "Artist", "Song")
    expect(best?.syncedLyrics?.trim()).toBeTruthy()
  })

  it("matches feat suffix after normalization", () => {
    const results = [
      {
        trackName: "Despacito (feat. Daddy Yankee)",
        artistName: "Luis Fonsi",
        duration: 229,
        plainLyrics: "correct",
      },
      {
        trackName: "Despacito Remix",
        artistName: "Luis Fonsi",
        duration: 229,
        plainLyrics: "wrong",
      },
    ]
    const best = pickBestCandidate(results, 229, "Luis Fonsi", "Despacito")
    expect(best?.trackName).toContain("Despacito")
    expect(best?.plainLyrics).toBe("correct")
  })

  it("prefers original over remix when API order is reversed", () => {
    const results = [
      {
        trackName: "Despacito Remix",
        artistName: "Luis Fonsi",
        duration: 229,
        plainLyrics: "wrong",
      },
      {
        trackName: "Despacito (feat. Daddy Yankee)",
        artistName: "Luis Fonsi",
        duration: 229,
        plainLyrics: "correct",
      },
    ]
    const best = pickBestCandidate(results, 229, "Luis Fonsi", "Despacito")
    expect(best?.plainLyrics).toBe("correct")
  })

  it("detects lyrics text presence", () => {
    expect(hasLyricsText({ trackName: "a", artistName: "b", plainLyrics: "x" })).toBe(true)
    expect(hasLyricsText({ trackName: "a", artistName: "b", syncedLyrics: "[00:00.00] x" })).toBe(
      true,
    )
    expect(hasLyricsText({ trackName: "a", artistName: "b" })).toBe(false)
  })
})
