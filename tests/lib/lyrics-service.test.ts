import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchLyrics } from "@/lib/lyrics-service"

const BASE = "https://lrclib.net/api"

describe("fetchLyrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns best match by duration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify([
              { id: 1, trackName: "Song", artistName: "Artist", duration: 180 },
              { id: 2, trackName: "Song", artistName: "Artist", duration: 240 },
            ]),
            { status: 200 },
          )
        }
        if (url.includes("/get")) {
          return new Response(
            JSON.stringify({
              id: 1,
              plainLyrics: "Line one",
              syncedLyrics: "[00:00.00] Line one",
            }),
            { status: 200 },
          )
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
    expect(result?.id).toBe(1)
    expect(result?.plainLyrics).toBe("Line one")
  })

  it("returns null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
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
