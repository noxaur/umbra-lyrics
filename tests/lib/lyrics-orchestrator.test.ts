import { describe, it, expect, vi, beforeEach } from "vitest"
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"

describe("orchestrateLyricsSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("reports progress callbacks during search", async () => {
    const phases: string[] = []

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search")) {
          return new Response("[]", { status: 200 })
        }
        return new Response("{}", { status: 404 })
      }),
    )

    await orchestrateLyricsSearch({
      track: "Song",
      artist: "Artist",
      title: "Artist - Song",
      durationSec: 200,
      onProgress: ({ phase }) => phases.push(phase),
    })

    expect(phases[0]).toBe("Parsing title…")
    expect(phases.some((p) => p.includes("artist + track"))).toBe(true)
    expect(phases.at(-1)).toMatch(/paste|edit/i)
  })

  it("finds lyrics on swapped artist/track strategy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const decoded = decodeURIComponent(url)
        if (decoded.includes("track_name=別世界") && decoded.includes("artist_name=天音かなた")) {
          return new Response(
            JSON.stringify([
              {
                id: 2,
                trackName: "別世界 (UnknownDIVA ver.)",
                artistName: "天音かなた",
                duration: 246,
                plainLyrics: "作詞の空白を埋めるみたいに",
              },
            ]),
            { status: 200 },
          )
        }
        if (url.includes("/get/2")) {
          return new Response(
            JSON.stringify({ id: 2, plainLyrics: "作詞の空白を埋めるみたいに", syncedLyrics: null }),
            { status: 200 },
          )
        }
        return new Response("[]", { status: 200 })
      }),
    )

    const result = await orchestrateLyricsSearch({
      track: "天音かなた",
      artist: "別世界",
      title: "別世界 - 天音かなた",
      durationSec: 246,
    })

    expect(result.status).toBe("found")
    expect(result.strategy).toBe("swapped_artist_track")
    expect(result.lyrics?.plainLyrics).toContain("作詞の空白")
  })

  it("prefers vocal lyrics over instrumental", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                trackName: "Song",
                artistName: "Artist",
                duration: 180,
                instrumental: true,
                plainLyrics: null,
              },
              {
                id: 2,
                trackName: "Song",
                artistName: "Artist",
                duration: 181,
                instrumental: false,
                plainLyrics: "Vocal line",
              },
            ]),
            { status: 200 },
          )
        }
        if (url.includes("/get/2")) {
          return new Response(
            JSON.stringify({ id: 2, plainLyrics: "Vocal line", syncedLyrics: null }),
            { status: 200 },
          )
        }
        return new Response("{}", { status: 404 })
      }),
    )

    const result = await orchestrateLyricsSearch({
      track: "Song",
      artist: "Artist",
      title: "Artist - Song",
      durationSec: 181,
    })

    expect(result.status).toBe("found")
    expect(result.lyrics?.plainLyrics).toBe("Vocal line")
  })

  it("returns instrumental when only instrumental matches exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                trackName: "Song",
                artistName: "Artist",
                duration: 180,
                instrumental: true,
                plainLyrics: null,
              },
            ]),
            { status: 200 },
          )
        }
        return new Response("{}", { status: 404 })
      }),
    )

    const result = await orchestrateLyricsSearch({
      track: "Song",
      artist: "Artist",
      title: "Artist - Song",
      durationSec: 180,
    })

    expect(result.status).toBe("instrumental")
    expect(result.matchId).toBe(1)
  })

  it("retries on network errors and reports retry progress", async () => {
    let calls = 0
    const phases: string[] = []

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++
        if (calls < 3) throw new TypeError("Failed to fetch")
        return new Response("[]", { status: 200 })
      }),
    )

    await orchestrateLyricsSearch({
      track: "Song",
      artist: "Artist",
      title: "Artist - Song",
      durationSec: 200,
      onProgress: ({ phase, retryRound }) => {
        phases.push(retryRound ? `${phase}:${retryRound}` : phase)
      },
    })

    expect(calls).toBeGreaterThanOrEqual(3)
    expect(phases.some((p) => p.includes("Retrying"))).toBe(true)
  })

  it("uses oembed author query strategy", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const decoded = decodeURIComponent(url)
      if (decoded.includes("q=") && decoded.includes("天音かなた")) {
        return new Response(
          JSON.stringify([
            {
              id: 5,
              trackName: "別世界",
              artistName: "天音かなた",
              duration: 246,
              plainLyrics: "found via channel",
            },
          ]),
          { status: 200 },
        )
      }
      if (url.includes("/get/5")) {
        return new Response(
          JSON.stringify({ id: 5, plainLyrics: "found via channel", syncedLyrics: null }),
          { status: 200 },
        )
      }
      return new Response("[]", { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await orchestrateLyricsSearch({
      track: "別世界",
      artist: "",
      title: "別世界",
      durationSec: 246,
      oembedAuthor: "天音かなた",
    })

    expect(result.status).toBe("found")
    expect(result.strategy).toBe("query_oembed_author")
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("q="), expect.any(Object))
  })

  it("falls back to lyrics.ovh when LRCLIB has no lyrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("lrclib.net")) {
          return new Response("[]", { status: 200 })
        }
        if (url.includes("/api/lyrics/ovh/")) {
          return new Response(JSON.stringify({ lyrics: "Fallback line one\nLine two" }), {
            status: 200,
          })
        }
        return new Response("{}", { status: 404 })
      }),
    )

    const phases: string[] = []
    const result = await orchestrateLyricsSearch({
      track: "Rare Song",
      artist: "Unknown Artist",
      title: "Unknown Artist - Rare Song",
      durationSec: 200,
      onProgress: ({ phase }) => phases.push(phase),
    })

    expect(result.status).toBe("found")
    expect(result.providerId).toBe("lyrics-ovh")
    expect(result.lyrics?.plainLyrics).toContain("Fallback line")
    expect(phases.some((p) => p.includes("alternate"))).toBe(true)
  })
})
