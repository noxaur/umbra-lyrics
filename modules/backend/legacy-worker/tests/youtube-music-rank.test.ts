import { describe, expect, it } from "vitest"
import {
  pickBestYouTubeMusicHit,
  scoreYouTubeMusicHit,
  type YouTubeMusicHit,
} from "../../../shared/youtube/youtube-music-rank"

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

  it("does not penalize legitimate instrument words in track titles", () => {
    const pianoMan = hit({
      videoId: "piano000001",
      title: "Piano Man",
      channel: "Billy Joel - Topic",
      durationSec: 336,
    })

    expect(scoreYouTubeMusicHit(pianoMan, "Billy Joel", "Piano Man", 336)).toBeLessThanOrEqual(74)
  })

  it("prefers studio audio over guitar session for Anytime Anywhere", () => {
    const studio = hit({
      videoId: "OqQAFmkrzew",
      title: "Anytime Anywhere",
      channel: "milet",
      durationSec: 231,
    })
    const guitar = hit({
      videoId: "oSvR4C7RK0w",
      title: "Anytime Anywhere - A.Gt Session",
      channel: "milet",
      durationSec: 235,
    })

    expect(
      pickBestYouTubeMusicHit([guitar, studio], "milet", "Anytime Anywhere", 231)?.videoId,
    ).toBe("OqQAFmkrzew")
  })
})
