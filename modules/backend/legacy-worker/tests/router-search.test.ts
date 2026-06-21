import { describe, expect, it, vi, beforeEach } from "vitest"
import { handleLyricsLrc } from "../src/handlers/lyrics-lrc"
import { handleLyricsSearch } from "../src/handlers/lyrics-search"
import { handleApiRequest } from "../src/router"
import { CORS_HEADERS } from "../src/cors"

describe("unified lyrics search router", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 400 when track and q are missing", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/lyrics/search?artist=Coldplay"),
    )
    expect(res?.status).toBe(400)
  })

  it("fans out scrapers and returns ranked candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes("genius.com/api/search")) {
          return Response.json({
            response: {
              sections: [
                {
                  type: "song",
                  hits: [
                    {
                      result: {
                        id: 1,
                        url: "https://genius.com/yellow",
                        title: "Yellow",
                        primary_artist: { name: "Coldplay" },
                      },
                    },
                  ],
                },
              ],
            },
          })
        }
        if (u.includes("genius.com/yellow")) {
          return new Response(
            '<div data-lyrics-container="true">Look at the stars</div>',
            { status: 200 },
          )
        }
        if (u.includes("azlyrics.com")) {
          return new Response(
            '<div class="lyricsh">Look at the stars</div>',
            { status: 200 },
          )
        }
        return new Response("", { status: 404 })
      }),
    )

    const res = await handleLyricsSearch("", "Coldplay", "Yellow")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      candidates: Array<{ source: string; plainLyrics: string | null }>
    }
    expect(body.candidates.length).toBeGreaterThan(0)
    expect(body.candidates.some((c) => c.plainLyrics?.includes("stars"))).toBe(true)
  })

  it("routes /api/lyrics/search through handleApiRequest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    )

    const res = await handleApiRequest(
      new Request("http://localhost/api/lyrics/search?track=Yellow&artist=Coldplay"),
    )
    expect(res?.status).toBe(200)
    expect(res?.headers.get("Access-Control-Allow-Origin")).toBe(
      CORS_HEADERS["Access-Control-Allow-Origin"],
    )
  })
})

describe("lyrics LRC endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 400 when track is missing", async () => {
    const res = await handleLyricsLrc("Coldplay", "")
    expect(res.status).toBe(400)
  })

  it("returns synced lyrics from lrclib when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes("lrclib.net/api/get?")) {
          return Response.json({
            id: 9,
            trackName: "Yellow",
            artistName: "Coldplay",
            syncedLyrics: "[00:10.00] Look at the stars",
            plainLyrics: "Look at the stars",
          })
        }
        return new Response("", { status: 404 })
      }),
    )

    const res = await handleLyricsLrc("Coldplay", "Yellow")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { syncedLyrics: string; source: string } }
    expect(body.result.source).toBe("lrclib")
    expect(body.result.syncedLyrics).toContain("[00:10.00]")
  })

  it("routes /api/lyrics/lrc through handleApiRequest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("lrclib.net/api/get?")) {
          return Response.json({
            id: 1,
            trackName: "Yellow",
            artistName: "Coldplay",
            syncedLyrics: "[00:01.00] Test",
          })
        }
        return new Response("", { status: 404 })
      }),
    )

    const res = await handleApiRequest(
      new Request("http://localhost/api/lyrics/lrc?artist=Coldplay&track=Yellow"),
    )
    expect(res?.status).toBe(200)
  })
})
