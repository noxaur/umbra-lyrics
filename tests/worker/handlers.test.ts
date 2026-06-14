import { describe, expect, it, vi, beforeEach } from "vitest"
import { handleLrclib } from "../../worker/handlers/lrclib"
import { handleMusicBrainz } from "../../worker/handlers/musicbrainz"
import { handleYouTubeOEmbed } from "../../worker/handlers/youtube-oembed"
import { handleMegalobizSearch } from "../../worker/handlers/megalobiz"
import { handleOvhLyrics } from "../../worker/handlers/ovh"
import { handleApiRequest } from "../../worker/router"
import { CORS_HEADERS } from "../../worker/cors"

describe("lyrics worker handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("proxies lyrics.ovh responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ lyrics: "Look at the stars" }, { status: 200 }),
      ),
    )

    const res = await handleOvhLyrics("Coldplay", "Yellow")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { lyrics: string }
    expect(body.lyrics).toContain("stars")
  })

  it("returns empty megalobiz results when search page has no matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html><body>no results</body></html>", { status: 200 })),
    )

    const res = await handleMegalobizSearch("Artist", "Track")
    const body = (await res.json()) as { results: unknown[] }
    expect(body.results).toEqual([])
  })

  it("parses megalobiz LRC from search results", async () => {
    const searchHtml = `
      <a class="entity_name" id="123" name="Yellow by Coldplay" href="/lrc/maker/yellow"></a>
    `
    const lrcHtml = `<span id="lrc_123_lyrics">[00:10.00] Hello world</span>`

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/search/")) {
          return new Response(searchHtml, { status: 200 })
        }
        return new Response(lrcHtml, { status: 200 })
      }),
    )

    const res = await handleMegalobizSearch("Coldplay", "Yellow")
    const body = (await res.json()) as {
      results: Array<{ syncedLyrics: string; trackName: string }>
    }
    expect(body.results[0]?.trackName).toBe("Yellow")
    expect(body.results[0]?.syncedLyrics).toContain("Hello world")
  })

  it("proxies LRCLIB search with CORS headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([{ id: 1, trackName: "Song", artistName: "Artist", duration: 180 }], {
          status: 200,
        }),
      ),
    )

    const res = await handleLrclib("/api/lyrics/lrclib/search", "?q=test")
    expect(res.status).toBe(200)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
    const body = (await res.json()) as Array<{ id: number }>
    expect(body[0]?.id).toBe(1)
  })

  it("proxies MusicBrainz with CORS headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ recordings: [{ id: "mb-1", title: "Song" }] }, { status: 200 }),
      ),
    )

    const res = await handleMusicBrainz("/api/lyrics/musicbrainz/recording", "?query=test&fmt=json")
    expect(res.status).toBe(200)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
  })

  it("proxies YouTube oEmbed with CORS headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ title: "Video", author_name: "Channel" }, { status: 200 }),
      ),
    )

    const res = await handleYouTubeOEmbed("abc123")
    expect(res.status).toBe(200)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
    const body = (await res.json()) as { author_name: string }
    expect(body.author_name).toBe("Channel")
  })

  it("handleApiRequest returns CORS preflight for OPTIONS", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/lyrics/lrclib/search", { method: "OPTIONS" }),
    )
    expect(res?.status).toBe(200)
    expect(res?.headers.get("Access-Control-Allow-Origin")).toBe(CORS_HEADERS["Access-Control-Allow-Origin"])
  })
})
