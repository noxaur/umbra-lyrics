import { describe, expect, it, vi, beforeEach } from "vitest"
import { handleMusixmatchSearch } from "../src/handlers/musixmatch"

vi.mock("../src/scraper/fetch", () => ({
  fetchHtml: vi.fn(),
}))

import { fetchHtml } from "../src/scraper/fetch"

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

  it("ranks API search results by artist and track match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: {
              body: {
                track_list: [
                  {
                    track: {
                      track_id: 1,
                      track_name: "Wrong Song",
                      artist_name: "Other Artist",
                      track_length: 200,
                      has_lyrics: 1,
                    },
                  },
                  {
                    track: {
                      track_id: 2,
                      track_name: "Target Song",
                      artist_name: "Target Artist",
                      track_length: 180,
                      has_lyrics: 1,
                    },
                  },
                ],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: { body: { lyrics: { lyrics_body: "Line one\nLine two\nLine three\nLine four" } } },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { body: {} } })),
      )
    vi.stubGlobal("fetch", fetchMock)

    const res = await handleMusixmatchSearch(
      "Target Artist",
      "Target Song",
      { MUSIXMATCH_API_KEY: "test-key" },
      180,
    )
    const data = (await res.json()) as {
      candidates?: Array<{ sourceId?: string; trackName?: string }>
    }
    expect(data.candidates?.[0]?.sourceId).toBe("2")
    expect(data.candidates?.[0]?.trackName).toBe("Target Song")
  })
})
