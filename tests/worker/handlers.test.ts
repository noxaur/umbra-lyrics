import { describe, expect, it, vi, beforeEach } from "vitest"
import { handleMegalobizSearch } from "../../worker/handlers/megalobiz"
import { handleOvhLyrics } from "../../worker/handlers/ovh"

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
})
