import { beforeEach, describe, expect, it } from "vitest"
import {
  addRecentSong,
  clearRecentSongs,
  formatRecentLabel,
  getRecentSongs,
  needsEnglishSubtitle,
  patchRecentSong,
} from "@/lib/recent-songs"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"

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

  it("appends english subtitle when available for non-latin metadata", () => {
    const label = formatRecentLabel({
      videoId: "abc",
      title: "【MV】別世界 - 天音かなた",
      artist: "天音かなた",
      track: "別世界",
      englishArtist: "Amane Kanata",
      englishTrack: "Another World",
      playedAt: 0,
    })
    expect(label).toBe("天音かなた · 別世界 (Amane Kanata · Another World)")
  })

  it("skips english subtitle for latin metadata", () => {
    expect(needsEnglishSubtitle("Artist Name · Song Title")).toBe(false)
    const label = formatRecentLabel({
      videoId: "abc",
      title: "Artist Name - Song Title",
      artist: "Artist Name",
      track: "Song Title",
      englishArtist: "Artist Name",
      englishTrack: "Song Title",
      playedAt: 0,
    })
    expect(label).toBe("Artist Name · Song Title")
  })

  it("persists english metadata patches", () => {
    addRecentSong({
      videoId: "abc",
      title: "別世界",
      artist: "天音かなた",
      track: "別世界",
    })
    patchRecentSong("abc", {
      englishArtist: "Amane Kanata",
      englishTrack: "Another World",
    })
    expect(getRecentSongs()[0]).toMatchObject({
      englishArtist: "Amane Kanata",
      englishTrack: "Another World",
    })
  })
})

describe("youtube-thumbnail", () => {
  it("builds mqdefault thumbnail url", () => {
    expect(youtubeThumbnailUrl("Ktk_EDLDPeY")).toBe(
      "https://i.ytimg.com/vi/Ktk_EDLDPeY/mqdefault.jpg",
    )
  })
})
