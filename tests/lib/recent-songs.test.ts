import { beforeEach, describe, expect, it } from "vitest"
import {
  addRecentSong,
  clearRecentSongs,
  formatRecentLabel,
  getRecentSongs,
} from "@/lib/recent-songs"

describe("recent-songs", () => {
  beforeEach(() => {
    clearRecentSongs()
  })

  it("formats artist and track when available", () => {
    const label = formatRecentLabel({
      videoId: "abc",
      title: "【MV】別世界 - 天音かなた",
      artist: "天音かなた",
      track: "別世界",
      playedAt: 0,
    })
    expect(label).toBe("天音かなた · 別世界")
  })

  it("parses legacy entries without artist/track fields", () => {
    localStorage.setItem(
      "song-kara-recent",
      JSON.stringify([
        {
          videoId: "abc",
          title: "Artist Name - Song Title",
          playedAt: 1,
        },
      ]),
    )

    const [song] = getRecentSongs()
    expect(song.artist).toBe("Artist Name")
    expect(song.track).toBe("Song Title")
    expect(formatRecentLabel(song)).toBe("Artist Name · Song Title")
  })

  it("stores artist and track on add", () => {
    addRecentSong({
      videoId: "xyz",
      title: "Full YouTube Title",
      artist: "Artist",
      track: "Track",
    })

    expect(getRecentSongs()[0]).toMatchObject({
      videoId: "xyz",
      artist: "Artist",
      track: "Track",
    })
  })
})
