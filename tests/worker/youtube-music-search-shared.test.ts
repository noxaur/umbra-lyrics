import { describe, expect, it, vi } from "vitest"
import {
  collectMusicHits,
  mapMusicItem,
  mergeMusicBiasedSearchResults,
  musicHitToSongSearchHit,
  searchSongsMusicFirst,
} from "../../worker/lib/youtube-music-search-shared"

describe("youtube-music-search-shared", () => {
  it("maps music list items to hits", () => {
    const hit = mapMusicItem({
      id: "abc12345678",
      title: "Track Name",
      artists: [{ name: "Artist Name" }],
      item_type: "song",
      duration: { seconds: 200 },
    })

    expect(hit).toEqual({
      videoId: "abc12345678",
      title: "Track Name",
      channel: "Artist Name",
      durationSec: 200,
      resultType: "song",
      isOfficialAudio: true,
    })
  })

  it("collects and dedupes music search shelves", () => {
    const hits = collectMusicHits({
      songs: {
        contents: [
          { id: "vid1", title: "Song A", artists: [{ name: "Artist" }], item_type: "song" },
        ],
      },
      videos: {
        contents: [
          { id: "vid1", title: "Song A", artists: [{ name: "Artist" }], item_type: "video" },
          { id: "vid2", title: "Song B", artists: [{ name: "Artist" }], item_type: "video" },
        ],
      },
    })

    expect(hits).toHaveLength(2)
    expect(hits.map((hit) => hit.videoId)).toEqual(["vid1", "vid2"])
  })

  it("strips music-only fields when converting to song search hits", () => {
    expect(
      musicHitToSongSearchHit({
        videoId: "vid1",
        title: "Track",
        channel: "Artist",
        durationSec: 180,
        resultType: "song",
        isOfficialAudio: true,
      }),
    ).toEqual({
      videoId: "vid1",
      title: "Track",
      channel: "Artist",
      durationSec: 180,
      viewCount: undefined,
    })
  })

  it("pins music hits above web hits when both return results", () => {
    const merged = mergeMusicBiasedSearchResults(
      [
        {
          videoId: "music123456",
          title: "Artist - Track",
          channel: "Artist",
          durationSec: 240,
        },
      ],
      [
        {
          videoId: "web12345678",
          title: "Artist - Track (Official Karaoke)",
          channel: "Karaoke Channel",
          durationSec: 240,
        },
      ],
      5,
    )

    expect(merged.map((hit) => hit.videoId)).toEqual(["music123456", "web12345678"])
  })

  it("fills remaining slots with web hits when music returns fewer than limit", () => {
    const merged = mergeMusicBiasedSearchResults(
      [
        {
          videoId: "music123456",
          title: "Artist - Track",
          channel: "Artist",
          durationSec: 240,
        },
      ],
      [
        {
          videoId: "web11111111",
          title: "Web Result A",
          channel: "Channel A",
          durationSec: 200,
        },
        {
          videoId: "web22222222",
          title: "Web Result B",
          channel: "Channel B",
          durationSec: 210,
        },
      ],
      3,
    )

    expect(merged.map((hit) => hit.videoId)).toEqual(["music123456", "web11111111", "web22222222"])
  })

  it("dedupes overlapping music and web hits while keeping music first", () => {
    const merged = mergeMusicBiasedSearchResults(
      [
        {
          videoId: "shared12345",
          title: "Artist - Track",
          channel: "Artist",
          durationSec: 240,
        },
      ],
      [
        {
          videoId: "shared12345",
          title: "Artist - Track (Official Karaoke)",
          channel: "Karaoke Channel",
          durationSec: 240,
        },
        {
          videoId: "web22222222",
          title: "Web Result B",
          channel: "Channel B",
          durationSec: 210,
        },
      ],
      3,
    )

    expect(merged.map((hit) => hit.videoId)).toEqual(["shared12345", "web22222222"])
  })

  it("returns ranked music hits when music search succeeds", async () => {
    const yt = {
      music: {
        search: vi.fn().mockImplementation((_query: string, filters: { type: string }) => {
          if (filters.type === "song") {
            return Promise.resolve({
              songs: {
                contents: [
                  {
                    id: "official123",
                    title: "Artist - Track (Official Audio)",
                    artists: [{ name: "Artist" }],
                    item_type: "song",
                    duration: { seconds: 240 },
                  },
                ],
              },
            })
          }
          return Promise.resolve({ videos: { contents: [] } })
        }),
      },
      search: vi.fn().mockResolvedValue({ videos: [] }),
    }

    const results = await searchSongsMusicFirst(yt, "artist track", 5)

    expect(results).toHaveLength(1)
    expect(results[0]?.videoId).toBe("official123")
    expect(yt.search).toHaveBeenCalledWith("artist track", { type: "video" })
  })

  it("biases music hits above web hits when both searches return results", async () => {
    const yt = {
      music: {
        search: vi.fn().mockImplementation((_query: string, filters: { type: string }) => {
          if (filters.type === "song") {
            return Promise.resolve({
              songs: {
                contents: [
                  {
                    id: "music123456",
                    title: "Artist - Track",
                    artists: [{ name: "Artist" }],
                    item_type: "song",
                    duration: { seconds: 240 },
                  },
                ],
              },
            })
          }
          return Promise.resolve({ videos: { contents: [] } })
        }),
      },
      search: vi.fn().mockResolvedValue({
        videos: [
          {
            video_id: "web12345678",
            title: { toString: () => "Artist - Track (Official Karaoke)" },
            author: { name: "Karaoke Channel" },
            duration: { seconds: 240 },
          },
        ],
      }),
    }

    const results = await searchSongsMusicFirst(yt, "artist track karaoke", 5)

    expect(results.map((hit) => hit.videoId)).toEqual(["music123456", "web12345678"])
  })

  it("falls back to regular YouTube search when music returns no hits", async () => {
    const yt = {
      music: {
        search: vi.fn().mockResolvedValue({ songs: { contents: [] }, videos: { contents: [] } }),
      },
      search: vi.fn().mockResolvedValue({
        videos: [
          {
            video_id: "web12345678",
            title: { toString: () => "Artist - Track (Karaoke)" },
            author: { name: "Karaoke Channel" },
            duration: { seconds: 200 },
          },
        ],
      }),
    }

    const results = await searchSongsMusicFirst(yt, "artist track karaoke", 5)

    expect(results).toHaveLength(1)
    expect(results[0]?.videoId).toBe("web12345678")
    expect(yt.search).toHaveBeenCalledWith("artist track karaoke", { type: "video" })
  })

  it("returns music hits when web search fails but music succeeds", async () => {
    const yt = {
      music: {
        search: vi.fn().mockImplementation((_query: string, filters: { type: string }) => {
          if (filters.type === "song") {
            return Promise.resolve({
              songs: {
                contents: [
                  {
                    id: "music123456",
                    title: "Artist - Track",
                    artists: [{ name: "Artist" }],
                    item_type: "song",
                    duration: { seconds: 240 },
                  },
                ],
              },
            })
          }
          return Promise.resolve({ videos: { contents: [] } })
        }),
      },
      search: vi.fn().mockRejectedValue(new Error("web unavailable")),
    }

    const results = await searchSongsMusicFirst(yt, "artist track", 5)

    expect(results.map((hit) => hit.videoId)).toEqual(["music123456"])
  })

  it("falls back to regular YouTube search when music search throws", async () => {
    const yt = {
      music: {
        search: vi.fn().mockRejectedValue(new Error("music unavailable")),
      },
      search: vi.fn().mockResolvedValue({
        videos: [
          {
            video_id: "fallback123",
            title: { toString: () => "Fallback Track" },
            author: { name: "Channel" },
            duration: { seconds: 180 },
          },
        ],
      }),
    }

    const results = await searchSongsMusicFirst(yt, "query", 5)

    expect(results).toHaveLength(1)
    expect(results[0]?.videoId).toBe("fallback123")
    expect(yt.search).toHaveBeenCalled()
  })

  it("rethrows when both music and web search fail with no hits", async () => {
    const webError = new Error("web unavailable")
    const yt = {
      music: {
        search: vi.fn().mockRejectedValue(new Error("music unavailable")),
      },
      search: vi.fn().mockRejectedValue(webError),
    }

    await expect(searchSongsMusicFirst(yt, "query", 5)).rejects.toThrow("web unavailable")
  })
})
