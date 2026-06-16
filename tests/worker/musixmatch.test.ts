import { describe, expect, it, vi, beforeEach } from "vitest"
import { handleMusixmatchSearch } from "../../worker/handlers/musixmatch"

vi.mock("../../worker/scraper/fetch", () => ({
  fetchHtml: vi.fn(),
}))

import { fetchHtml } from "../../worker/scraper/fetch"

const mockFetchHtml = vi.mocked(fetchHtml)

describe("handleMusixmatchSearch", () => {
  beforeEach(() => {
    mockFetchHtml.mockReset()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { body: {} } }))),
    )
  })

  it("returns empty when track missing", async () => {
    const res = await handleMusixmatchSearch("Artist", "", {})
    expect(res.status).toBe(400)
  })

  it("uses scraper fallback when no API key", async () => {
    mockFetchHtml
      .mockResolvedValueOnce({
        ok: true,
        html: '<a href="/lyrics/Artist/Song">link</a>',
        url: "https://www.musixmatch.com/search/Artist/Song",
      })
      .mockResolvedValueOnce({
        ok: true,
        html: `
          <h1 class="mxm-track-title">Song</h1>
          <h2 class="mxm-track-artist">Artist</h2>
          <span class="mxm-lyrics__content">Line one</span>
          <span class="mxm-lyrics__content">Line two</span>
          <span class="mxm-lyrics__content">Line three</span>
          <span class="mxm-lyrics__content">Line four</span>
        `,
        url: "https://www.musixmatch.com/lyrics/Artist/Song",
      })

    const res = await handleMusixmatchSearch("Artist", "Song", {})
    const data = (await res.json()) as { candidates?: unknown[] }
    expect(data.candidates?.length).toBeGreaterThan(0)
  })
})
