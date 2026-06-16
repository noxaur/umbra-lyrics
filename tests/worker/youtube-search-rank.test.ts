import { describe, expect, it } from "vitest"
import { mapSearchVideos } from "../../worker/lib/youtube-search-map"
import { rankSongSearchHits, scoreSongSearchHit, type SongSearchHit } from "../../worker/lib/youtube-search-rank"
import { searchCandidateLimit } from "../../worker/lib/youtube-search-map"

function hit(overrides: Partial<SongSearchHit> = {}): SongSearchHit {
  return {
    videoId: "dQw4w9WgXcQ",
    title: "Artist - Track",
    channel: "ArtistVEVO",
    durationSec: 240,
    ...overrides,
  }
}

describe("youtube-search-rank", () => {
  it("prefers official lyric videos over reactions", () => {
    const official = hit({ title: "Queen - Bohemian Rhapsody (Official Lyric Video)" })
    const reaction = hit({ title: "Queen - Bohemian Rhapsody reaction" })
    expect(scoreSongSearchHit(official)).toBeLessThan(scoreSongSearchHit(reaction))
  })

  it("ranks karaoke-friendly results first", () => {
    const ranked = rankSongSearchHits([
      hit({ videoId: "bbbbbbbbbbb", title: "Song reaction video" }),
      hit({ videoId: "aaaaaaaaaaa", title: "Song - Official Karaoke" }),
    ])
    expect(ranked[0]?.videoId).toBe("aaaaaaaaaaa")
  })

  it("can promote a better match beyond the response limit", () => {
    const limit = 5
    const videos = Array.from({ length: 15 }, (_, index) => ({
      video_id: `id${String(index).padStart(9, "0")}`,
      title: {
        toString: () =>
          index === 12 ? "Song - Official Karaoke" : `Song reaction video ${index}`,
      },
      author: { name: "Channel" },
      duration: { seconds: 240 },
    }))

    const mapped = mapSearchVideos(videos, searchCandidateLimit(limit))
    const ranked = rankSongSearchHits(mapped).slice(0, limit)

    expect(mapped.length).toBeGreaterThan(limit)
    expect(ranked[0]?.title).toContain("Karaoke")
  })
})
