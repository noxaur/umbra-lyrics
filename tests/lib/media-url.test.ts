import { beforeEach, describe, expect, it, vi } from "vitest"
import { mediaResolveErrorMessage, resolveMediaInput } from "@/lib/media-url"

vi.mock("@/lib/spotify-to-youtube", () => ({
  resolveSpotifyTrackToYouTube: vi.fn(),
}))

import { resolveSpotifyTrackToYouTube } from "@/lib/spotify-to-youtube"

const mockResolveSpotify = vi.mocked(resolveSpotifyTrackToYouTube)

describe("resolveMediaInput", () => {
  beforeEach(() => {
    mockResolveSpotify.mockReset()
  })

  it("resolves YouTube URLs synchronously", async () => {
    const result = await resolveMediaInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(result).toEqual({
      ok: true,
      result: { kind: "youtube", videoId: "dQw4w9WgXcQ" },
    })
    expect(mockResolveSpotify).not.toHaveBeenCalled()
  })

  it("resolves Spotify URLs via spotify resolver", async () => {
    mockResolveSpotify.mockResolvedValue({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      track: {
        id: "6F5l0oJ5K7pZ2M9bXWnN8P",
        name: "Never Gonna Give You Up",
        artist: "Rick Astley",
        durationSec: 213,
      },
    })

    const result = await resolveMediaInput("https://open.spotify.com/track/6F5l0oJ5K7pZ2M9bXWnN8P")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.kind).toBe("spotify")
      if (result.result.kind === "spotify") {
        expect(result.result.videoId).toBe("dQw4w9WgXcQ")
      }
    }
  })

  it("maps spotify resolver errors", async () => {
    mockResolveSpotify.mockResolvedValue({ ok: false, reason: "no_youtube_match" })
    const result = await resolveMediaInput("https://open.spotify.com/track/6F5l0oJ5K7pZ2M9bXWnN8P")
    expect(result).toEqual({ ok: false, error: { kind: "no_youtube_match" } })
  })

  it("returns null for plain text queries", async () => {
    const result = await resolveMediaInput("queen bohemian rhapsody")
    expect(result).toBeNull()
    expect(mockResolveSpotify).not.toHaveBeenCalled()
  })

  it("returns invalid for empty input", async () => {
    const result = await resolveMediaInput("   ")
    expect(result).toBeNull()
  })
})

describe("mediaResolveErrorMessage", () => {
  it("returns user-facing messages", () => {
    expect(mediaResolveErrorMessage({ kind: "invalid" })).toContain("YouTube")
    expect(mediaResolveErrorMessage({ kind: "spotify_unavailable" })).toContain("Spotify")
    expect(mediaResolveErrorMessage({ kind: "no_youtube_match" })).toContain("YouTube")
  })
})
