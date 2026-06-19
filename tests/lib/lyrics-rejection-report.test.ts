import { describe, expect, it } from "vite-plus/test"
import { buildLyricsRejectionUrl } from "@/lib/lyrics-rejection-report"

describe("buildLyricsRejectionUrl", () => {
  it("builds an encoded GitHub issue URL with lyrics and diagnostics", () => {
    const url = new URL(
      buildLyricsRejectionUrl({
        videoId: "abc_123",
        title: "Artist — Track (Official)",
        artist: "Artist & Guest",
        track: "Track / Remix",
        providerId: "lrclib",
        synced: true,
        autoTimed: false,
        aligned: false,
        currentLyrics: {
          plainLyrics: "First line\nSecond line",
          syncedLyrics: "[00:01.00] First line\n[00:04.00] Second line",
        },
        alternates: [
          {
            providerId: "genius",
            id: "genius-1",
            synced: false,
            lineCount: 2,
            rankScore: 4,
            lyricsResult: {
              providerId: "genius",
              id: "genius-1",
              plainLyrics: "Alternate one\nAlternate two",
              syncedLyrics: null,
            },
          },
        ],
        providersSearched: ["lrclib", "genius"],
        attempts: ["lrclib:exact", "genius:normalized"],
      }),
    )

    expect(url.origin + url.pathname).toBe(
      "https://github.com/noxaur/umbra-lyrics/issues/new",
    )
    expect(url.searchParams.get("title")).toBe(
      "Reject lyrics: Artist & Guest — Track / Remix",
    )

    const body = url.searchParams.get("body") ?? ""
    expect(body).toContain("## Additional details")
    expect(body).toContain("https://music.youtube.com/watch?v=abc_123")
    expect(body).toContain("https://www.youtube.com/watch?v=abc_123")
    expect(body).toContain("**Provider:** LRCLIB (`lrclib`)")
    expect(body).toContain("**Timing:** Synced")
    expect(body).toContain("[00:01.00] First line")
    expect(body).toContain("### Genius (`genius`)")
    expect(body).toContain("Alternate one")
    expect(body).toContain("LRCLIB, Genius")
    expect(body).toContain("lrclib:exact")
  })

  it("falls back to displayed lines and unknown metadata", () => {
    const url = new URL(
      buildLyricsRejectionUrl({
        videoId: "video-id",
        title: "",
        artist: "",
        track: "",
        providerId: "transcription",
        synced: false,
        autoTimed: true,
        aligned: false,
        displayedLines: ["Fallback line"],
        alternates: [],
        providersSearched: [],
        attempts: [],
      }),
    )

    expect(url.searchParams.get("title")).toBe("Reject lyrics: Unknown track")
    const body = url.searchParams.get("body") ?? ""
    expect(body).toContain("**Artist:** Unknown")
    expect(body).toContain("**Track:** Unknown")
    expect(body).toContain("**Timing:** Auto-timed")
    expect(body).toContain("Fallback line")
  })

  it("keeps issue URLs within a browser-safe length for long lyrics", () => {
    const longLine = "あ".repeat(120)
    const longLyrics = Array.from({ length: 120 }, () => longLine).join("\n")
    const alternates = Array.from({ length: 6 }, (_, index) => ({
      providerId: "genius" as const,
      id: `genius-${index}`,
      synced: false,
      lineCount: 120,
      rankScore: 1,
      lyricsResult: {
        providerId: "genius" as const,
        id: `genius-${index}`,
        plainLyrics: longLyrics,
        syncedLyrics: null,
      },
    }))

    const href = buildLyricsRejectionUrl({
      videoId: "abc_123",
      title: "Long track",
      artist: "Artist",
      track: "Track",
      providerId: "lrclib",
      synced: true,
      autoTimed: false,
      aligned: false,
      currentLyrics: {
        plainLyrics: longLyrics,
        syncedLyrics: null,
      },
      alternates,
      providersSearched: ["lrclib", "genius"],
      attempts: ["lrclib:exact"],
    })

    expect(href.length).toBeLessThanOrEqual(7500)
    const body = new URL(href).searchParams.get("body") ?? ""
    expect(body).toMatch(/truncated|Omitted/)
  })
})
