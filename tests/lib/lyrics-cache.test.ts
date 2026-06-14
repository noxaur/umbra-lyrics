import { beforeEach, describe, expect, it } from "vitest"
import {
  clearLyricsCache,
  getLyricsCache,
  setLyricsCache,
  type LyricsCacheEntry,
} from "@/lib/lyrics-cache"

const sampleEntry = {
  videoId: "abc12345678",
  lyricsResult: { id: 42, plainLyrics: "Line one", syncedLyrics: "[00:00.00] Line one" },
  lines: [{ startMs: 0, endMs: 3000, text: "Line one" }],
  synced: true,
  englishLines: [] as string[],
  languageCode: "jpn",
  title: "Track - Artist",
  artist: "Artist",
  track: "Track",
}

describe("lyrics-cache", () => {
  beforeEach(() => {
    clearLyricsCache()
  })

  it("returns null when nothing cached", () => {
    expect(getLyricsCache("abc12345678")).toBeNull()
  })

  it("round-trips a cache entry by videoId", () => {
    setLyricsCache(sampleEntry)
    const cached = getLyricsCache("abc12345678")
    expect(cached).not.toBeNull()
    expect(cached?.lines).toEqual(sampleEntry.lines)
    expect(cached?.synced).toBe(true)
    expect(cached?.lyricsResult.id).toBe(42)
    expect(cached?.artist).toBe("Artist")
    expect(cached?.cachedAt).toBeTypeOf("number")
  })

  it("rejects mismatched videoId in payload", () => {
    localStorage.setItem(
      "song-kara-lyrics:abc12345678",
      JSON.stringify({ ...sampleEntry, v: 1, videoId: "other", cachedAt: 1 }),
    )
    expect(getLyricsCache("abc12345678")).toBeNull()
  })

  it("rejects invalid or empty cache payloads", () => {
    localStorage.setItem("song-kara-lyrics:abc12345678", "not-json")
    expect(getLyricsCache("abc12345678")).toBeNull()

    setLyricsCache({ ...sampleEntry, lines: [] })
    expect(getLyricsCache("abc12345678")).toBeNull()
  })

  it("clears one video or all lyrics cache keys", () => {
    setLyricsCache(sampleEntry)
    setLyricsCache({ ...sampleEntry, videoId: "xyz98765432" })

    clearLyricsCache("abc12345678")
    expect(getLyricsCache("abc12345678")).toBeNull()
    expect(getLyricsCache("xyz98765432")).not.toBeNull()

    clearLyricsCache()
    expect(getLyricsCache("xyz98765432")).toBeNull()
  })

  it("overwrites prior cache for the same videoId", () => {
    setLyricsCache(sampleEntry)
    setLyricsCache({
      ...sampleEntry,
      track: "Updated",
      lines: [{ startMs: 0, endMs: 2000, text: "New line" }],
    })

    const cached = getLyricsCache("abc12345678") as LyricsCacheEntry
    expect(cached.track).toBe("Updated")
    expect(cached.lines[0].text).toBe("New line")
  })
})
