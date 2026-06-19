import { describe, expect, it, vi } from "vitest"
import {
  collectMusicHits,
  mapMusicItem,
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
      search: vi.fn(),
    }

    const results = await searchSongsMusicFirst(yt, "artist track", 5)

    expect(results).toHaveLength(1)
    expect(results[0]?.videoId).toBe("official123")
    expect(yt.search).not.toHaveBeenCalled()
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
})
