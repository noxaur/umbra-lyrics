import { describe, expect, it } from "vitest"
import {
  stripMusicYouTubeHost,
  youTubeIframeEmbedUrl,
  youTubeMusicPlaylistUrl,
  youTubeMusicWatchUrl,
  youTubeOEmbedApiUrl,
  youTubeOEmbedWatchUrls,
  youTubePlaybackEmbedUrl,
  youTubePlaylistRssFeedUrls,
  youTubeWatchUrl,
} from "../../worker/lib/youtube-endpoints"

describe("youtube-endpoints", () => {
  const ID = "dQw4w9WgXcQ"
  const PL = "PLabc123"

  it("strips music. from YouTube Music hosts for playback", () => {
    expect(
      stripMusicYouTubeHost(
        "https://music.youtube.com/watch?v=dJth8oW7CAQ&si=oXkZmojYaCH0lOhR",
      ),
    ).toBe("https://www.youtube.com/watch?v=dJth8oW7CAQ&si=oXkZmojYaCH0lOhR")
    expect(stripMusicYouTubeHost("https://music.youtube.com/feeds/videos.xml?playlist_id=PLabc"))
      .toBe("https://www.youtube.com/feeds/videos.xml?playlist_id=PLabc")
  })

  it("builds music-first watch URLs and derives youtube.com playback URLs", () => {
    expect(youTubeMusicWatchUrl(ID)).toBe(`https://music.youtube.com/watch?v=${ID}`)
    expect(youTubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
    expect(youTubeWatchUrl(ID, { si: "share" })).toBe(
      `https://www.youtube.com/watch?v=${ID}&si=share`,
    )
  })

  it("builds playback embed URLs from video ids", () => {
    expect(youTubePlaybackEmbedUrl(ID, { rel: 0 })).toBe(
      `https://www.youtube.com/embed/${ID}?rel=0`,
    )
    expect(youTubeIframeEmbedUrl(ID, { rel: 0 })).toBe(
      `https://www.youtube.com/embed/${ID}?rel=0`,
    )
  })

  it("builds playlist and RSS feed URLs with music stripped for fallback", () => {
    expect(youTubeMusicPlaylistUrl(PL)).toBe(`https://music.youtube.com/playlist?list=${PL}`)
    expect(youTubePlaylistRssFeedUrls(PL)).toEqual([
      `https://music.youtube.com/feeds/videos.xml?playlist_id=${PL}`,
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${PL}`,
    ])
  })

  it("builds oEmbed candidates from music watch URLs", () => {
    expect(youTubeOEmbedWatchUrls(ID)).toEqual([
      `https://music.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=${ID}`,
    ])
    const watchUrl = youTubeMusicWatchUrl(ID)
    expect(youTubeOEmbedApiUrl(watchUrl)).toBe(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    )
  })
})
