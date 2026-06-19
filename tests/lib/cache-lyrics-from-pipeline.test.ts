import { beforeEach, describe, expect, it } from "vitest"
import { cacheLyricsFromPipeline } from "@/lib/cache-lyrics-from-pipeline"
import { getLyricsCache } from "@/lib/lyrics-cache"
import { clearLyricsCache } from "@/lib/lyrics-cache"

describe("cacheLyricsFromPipeline", () => {
  beforeEach(() => {
    clearLyricsCache()
  })

  it("writes parsed lyrics to cache", () => {
    const ok = cacheLyricsFromPipeline(
      {
        videoId: "dQw4w9WgXcQ",
        title: "Artist - Song",
        artist: "Artist",
        track: "Song",
        durationSec: 200,
      },
      {
        native: {
          status: "found",
          strategy: "test",
          attempts: [],
          providersTried: ["lrclib"],
          message: "ok",
          synced: true,
          lyrics: {
            id: 1,
            providerId: "lrclib",
            plainLyrics: "Hello\nWorld",
            syncedLyrics: null,
          },
        },
        english: { lines: [], source: "translated", status: "failed" },
        timings: { nativeMs: 1, englishMs: 0, parallelMs: 1 },
      },
    )

    expect(ok).toBe(true)
    const cached = getLyricsCache("dQw4w9WgXcQ")
    expect(cached?.lines.length).toBeGreaterThan(0)
    expect(cached?.artist).toBe("Artist")
  })
})
