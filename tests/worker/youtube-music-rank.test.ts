import { describe, expect, it } from "vitest"
import {
  pickBestYouTubeMusicHit,
  scoreYouTubeMusicHit,
  type YouTubeMusicHit,
} from "../../worker/lib/youtube-music-rank"

function hit(overrides: Partial<YouTubeMusicHit> = {}): YouTubeMusicHit {
  return {
    videoId: "dQw4w9WgXcQ",
    title: "Track Name",
    channel: "Artist Name - Topic",
    durationSec: 240,
    resultType: "song",
    isOfficialAudio: true,
    ...overrides,
  }
}

describe("youtube-music-rank", () => {
  it("prefers official audio over official music videos for canonical playback", () => {
    const audio = hit()
    const video = hit({
      videoId: "video000001",
      title: "Artist Name - Track Name (Official Music Video)",
      channel: "Artist Name VEVO",
      resultType: "video",
      isOfficialAudio: false,
    })

    expect(scoreYouTubeMusicHit(audio, "Artist Name", "Track Name", 240)).toBeLessThan(
      scoreYouTubeMusicHit(video, "Artist Name", "Track Name", 240),
    )
  })

  it("rejects covers even when the title contains the track", () => {
    const result = pickBestYouTubeMusicHit(
      [
        hit({
          videoId: "cover000001",
          title: "Track Name cover",
          channel: "Cover Channel",
          resultType: "video",
          isOfficialAudio: false,
        }),
      ],
      "Artist Name",
      "Track Name",
      240,
    )

    expect(result).toBeNull()
  })
})
