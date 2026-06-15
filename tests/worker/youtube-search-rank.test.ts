import { describe, expect, it } from "vitest"
import { rankSongSearchHits, scoreSongSearchHit, type SongSearchHit } from "../../worker/lib/youtube-search-rank"

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
})
