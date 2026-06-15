import { describe, expect, it } from "vitest"
import { mapSearchVideo, parseViewCount } from "../../worker/lib/youtube-search-map"

describe("youtube-search-map", () => {
  it("parses compact view counts", () => {
    expect(parseViewCount("1.2M views")).toBe(1_200_000)
    expect(parseViewCount("845K views")).toBe(845_000)
    expect(parseViewCount("12,345 views")).toBe(12_345)
  })

  it("maps innertube video nodes", () => {
    const mapped = mapSearchVideo({
      video_id: "dQw4w9WgXcQ",
      title: { toString: () => "Artist - Track" },
      author: { name: "ArtistVEVO" },
      duration: { seconds: 212 },
      view_count: { toString: () => "1.2M views" },
      is_live: false,
    })

    expect(mapped).toEqual({
      videoId: "dQw4w9WgXcQ",
      title: "Artist - Track",
      channel: "ArtistVEVO",
      durationSec: 212,
      viewCount: 1_200_000,
    })
  })

  it("skips live videos", () => {
    expect(
      mapSearchVideo({
        video_id: "dQw4w9WgXcQ",
        title: { toString: () => "Live now" },
        is_live: true,
      }),
    ).toBeNull()
  })
})
