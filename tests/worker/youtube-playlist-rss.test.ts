import { describe, expect, it, vi } from "vitest"
import { fetchPlaylistViaRss, parseYouTubePlaylistRss } from "../../worker/lib/youtube-playlist-rss"

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <title>Artist - Track One</title>
    <author><name>ArtistVEVO</name></author>
  </entry>
  <entry>
    <yt:videoId>fJ9rUzIMcZQ</yt:videoId>
    <title>Queen &amp; Co</title>
    <author><name>Queen Official</name></author>
  </entry>
</feed>`

describe("youtube playlist rss", () => {
  it("parses public playlist feeds", () => {
    const result = parseYouTubePlaylistRss(SAMPLE_RSS, "PLabc123", 10)
    expect(result?.items).toHaveLength(2)
    expect(result?.items[0].videoId).toBe("dQw4w9WgXcQ")
    expect(result?.items[1].title).toBe("Queen & Co")
  })

  it("tries the YouTube Music RSS feed before the regular YouTube feed", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("music.youtube.com")) {
        return new Response("not found", { status: 404 })
      }
      return new Response(SAMPLE_RSS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchPlaylistViaRss("PLabc123", 10)
    expect(result?.items).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain("music.youtube.com/feeds/videos.xml")
    expect(fetchMock.mock.calls[1]?.[0]).toContain("www.youtube.com/feeds/videos.xml")
  })
})
