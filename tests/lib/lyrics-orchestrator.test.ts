import { describe, it, expect, vi, beforeEach } from "vitest"
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"

describe("orchestrateLyricsSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("reports progress callbacks during parallel search", async () => {
    const phases: string[] = []

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/lyrics/lrclib") || url.includes("/search")) {
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
    expect(phases.some((p) => p.includes("Searching") && p.includes("sources"))).toBe(true)
    expect(phases.at(-1)).toMatch(/paste|edit|timed out|No lyrics/i)
  })

  it("does not include transcription in parallel provider search", async () => {
    const { PROVIDER_FALLBACK_ORDER } = await import("@/lib/lyrics-providers")
    expect(PROVIDER_FALLBACK_ORDER).not.toContain("transcription")
  })

  it("finds lyrics via lrclib in parallel search", async () => {
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
    expect(result.strategy).toBe("parallel_ranked")
    expect(result.lyrics?.plainLyrics).toContain("作詞の空白")
    expect(result.providersTried).toContain("lrclib")
  })

  it("prefers vocal lyrics over instrumental when ranking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search") || url.includes("/api/lyrics/lrclib")) {
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
                plainLyrics: "Vocal line one\nTwo\nThree\nFour",
              },
            ]),
            { status: 200 },
          )
        }
        if (url.includes("/get/2")) {
          return new Response(
            JSON.stringify({ id: 2, plainLyrics: "Vocal line one\nTwo\nThree\nFour", syncedLyrics: null }),
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
    expect(result.lyrics?.plainLyrics).toContain("Vocal line")
  })

  it("returns partial when only instrumental metadata exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search") || url.includes("/api/lyrics/lrclib")) {
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
      providerIds: ["lrclib"],
    })

    expect(["instrumental", "partial", "not_found"]).toContain(result.status)
  })

  it("uses oembed author in lrclib provider search", async () => {
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
              plainLyrics: "found via channel\nLine two\nLine three\nLine four",
            },
          ]),
          { status: 200 },
        )
      }
      if (url.includes("/get/5")) {
        return new Response(
          JSON.stringify({
            id: 5,
            plainLyrics: "found via channel\nLine two\nLine three\nLine four",
            syncedLyrics: null,
          }),
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
      providerIds: ["lrclib"],
    })

    expect(result.status).toBe("found")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q="))).toBe(true)
  })

  it("ranks lyrics.ovh result when LRCLIB has no lyrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/lyrics/lrclib") || url.includes("/search")) {
          return new Response("[]", { status: 200 })
        }
        if (url.includes("/api/lyrics/ovh/")) {
          return new Response(
            JSON.stringify({ lyrics: "Fallback line one\nLine two\nLine three\nLine four" }),
            {
              status: 200,
            },
          )
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
    expect(phases.some((p) => p.includes("Searching") && p.includes("sources"))).toBe(true)
    expect(result.providersTried.length).toBeGreaterThan(1)
  })

  it("collects alternates when multiple providers return lyrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/lyrics/ovh/")) {
          return new Response(
            JSON.stringify({ lyrics: "Ovh line one\nTwo\nThree\nFour" }),
            { status: 200 },
          )
        }
        if (url.includes("/search") || url.includes("/api/lyrics/lrclib")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                trackName: "Song",
                artistName: "Artist",
                duration: 200,
                plainLyrics: "Lrc line one\nTwo\nThree\nFour",
                syncedLyrics: "[00:00.00] Lrc line one\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four",
              },
            ]),
            { status: 200 },
          )
        }
        if (url.includes("/get/1")) {
          return new Response(
            JSON.stringify({
              id: 1,
              plainLyrics: "Lrc line one\nTwo\nThree\nFour",
              syncedLyrics: "[00:00.00] Lrc line one\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four",
            }),
            { status: 200 },
          )
        }
        return new Response("[]", { status: 200 })
      }),
    )

    const result = await orchestrateLyricsSearch({
      track: "Song",
      artist: "Artist",
      title: "Artist - Song",
      durationSec: 200,
    })

    expect(result.status).toBe("found")
    expect(result.providerId).toBe("lrclib")
    expect(result.alternates?.length).toBeGreaterThan(0)
  })
})
