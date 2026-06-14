import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchLyrics } from "@/lib/lyrics-service"

describe("fetchLyrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns best match by duration with lyrics", async () => {
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
                plainLyrics: "Line one",
                syncedLyrics: "[00:00.00] Line one",
              },
            ]),
            { status: 200 },
          )
        }
        if (url.includes("/get/2")) {
          return new Response(
            JSON.stringify({
              id: 2,
              plainLyrics: "Line one",
              syncedLyrics: "[00:00.00] Line one",
            }),
            { status: 200 },
          )
        }
        if (url.includes("/get?")) {
          return new Response("{}", { status: 404 })
        }
        return new Response("{}", { status: 404 })
      }),
    )

    const result = await fetchLyrics({
      track: "Song",
      artist: "Artist",
      album: "",
      durationSec: 181,
    })

    expect(result).not.toBeNull()
    expect(result?.id).toBe(2)
    expect(result?.plainLyrics).toBe("Line one")
  })

  it("falls back to search result lyrics when get 404s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify([
              {
                id: 33003929,
                trackName: "別世界 (UnknownDIVA ver.)",
                artistName: "天音かなた",
                duration: 246,
                instrumental: false,
                plainLyrics: "作詞の空白を埋めるみたいに",
                syncedLyrics: null,
              },
            ]),
            { status: 200 },
          )
        }
        return new Response("{}", { status: 404 })
      }),
    )

    const result = await fetchLyrics({
      track: "別世界",
      artist: "天音かなた",
      album: "",
      durationSec: 246,
    })

    expect(result).not.toBeNull()
    expect(result?.plainLyrics).toContain("作詞の空白")
  })

  it("uses q param search as fallback strategy", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("track_name=") && !url.includes("q=")) {
        return new Response("[]", { status: 200 })
      }
      if (url.includes("q=")) {
        return new Response(
          JSON.stringify([
            {
              id: 9,
              trackName: "Track",
              artistName: "Artist",
              duration: 200,
              plainLyrics: "Found via q",
            },
          ]),
          { status: 200 },
        )
      }
      if (url.includes("/get/9")) {
        return new Response(
          JSON.stringify({ id: 9, plainLyrics: "Found via q", syncedLyrics: null }),
          { status: 200 },
        )
      }
      return new Response("{}", { status: 404 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchLyrics({
      track: "Track",
      artist: "Artist",
      album: "",
      durationSec: 200,
    })

    expect(result?.plainLyrics).toBe("Found via q")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q="))).toBe(true)
  })

  it("prefers artist match over closer duration from another artist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                trackName: "別世界",
                artistName: "Kitri",
                duration: 255,
                plainLyrics: "wrong song",
              },
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
        return new Response("{}", { status: 404 })
      }),
    )

    const result = await fetchLyrics({
      track: "別世界",
      artist: "天音かなた",
      album: "",
      durationSec: 255,
    })

    expect(result?.id).toBe(2)
    expect(result?.plainLyrics).toContain("作詞の空白")
  })

  it("returns null when no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { status: 200 })),
    )

    const result = await fetchLyrics({
      track: "Missing",
      artist: "Nobody",
      album: "",
      durationSec: 200,
    })

    expect(result).toBeNull()
  })
})
