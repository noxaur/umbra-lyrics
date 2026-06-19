import { describe, expect, it, vi } from "vitest"
import { handleYouTubeOEmbed } from "../../worker/handlers/youtube-oembed"

describe("handleYouTubeOEmbed", () => {
  it("requests oEmbed with a YouTube Music watch URL first", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain(encodeURIComponent("https://music.youtube.com/watch?v=abc123"))
      return Response.json({ title: "Track", author_name: "Artist" }, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const res = await handleYouTubeOEmbed("abc123")
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("falls back to a regular YouTube watch URL when music oEmbed fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes(encodeURIComponent("music.youtube.com"))) {
        return new Response("not found", { status: 404 })
      }
      return Response.json({ title: "Track", author_name: "Artist" }, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const res = await handleYouTubeOEmbed("abc123")
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      encodeURIComponent("https://www.youtube.com/watch?v=abc123"),
    )
  })
})
