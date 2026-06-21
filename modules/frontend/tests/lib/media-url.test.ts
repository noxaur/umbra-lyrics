import { beforeEach, describe, expect, it, vi } from "vitest"
import { mediaResolveErrorMessage, resolveMediaInput } from "@/lib/media-url"

vi.mock("@/lib/spotify-to-youtube", () => ({
  resolveSpotifyTrackToYouTube: vi.fn(),
}))

vi.mock("@/lib/canonical-music-video", () => ({
  resolveCanonicalMusicVideo: vi.fn(),
}))

import { resolveSpotifyTrackToYouTube } from "@/lib/spotify-to-youtube"
import { resolveCanonicalMusicVideo } from "@/lib/canonical-music-video"

const mockResolveSpotify = vi.mocked(resolveSpotifyTrackToYouTube)
const mockResolveCanonical = vi.mocked(resolveCanonicalMusicVideo)

describe("resolveMediaInput", () => {
  beforeEach(() => {
    mockResolveSpotify.mockReset()
    mockResolveCanonical.mockReset()
  })

  it("resolves YouTube URLs through the canonical resolver", async () => {
    mockResolveCanonical.mockResolvedValue({
      ok: true,
      videoId: "canonical01",
      seedMetadata: {
        artist: "Artist",
        track: "Track",
        durationSec: 240,
        source: "music-api",
      },
    })

    const result = await resolveMediaInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(result).toEqual({
      ok: true,
      result: {
        kind: "youtube",
        videoId: "canonical01",
        seedMetadata: {
          artist: "Artist",
          track: "Track",
          durationSec: 240,
          source: "music-api",
        },
      },
    })
    expect(mockResolveSpotify).not.toHaveBeenCalled()
  })

  it("keeps YouTube URL video when canonical resolver has no confirmed match", async () => {
    mockResolveCanonical.mockResolvedValue({ ok: false, reason: "metadata_unconfirmed" })

    const result = await resolveMediaInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(result).toEqual({
      ok: true,
      result: { kind: "youtube", videoId: "dQw4w9WgXcQ" },
    })
  })

  it("resolves Spotify URLs through the canonical resolver", async () => {
    mockResolveCanonical.mockResolvedValue({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      seedMetadata: {
        artist: "Rick Astley",
        track: "Never Gonna Give You Up",
        durationSec: 213,
        isrc: undefined,
        source: "spotify",
      },
    })

    const result = await resolveMediaInput("https://open.spotify.com/track/6F5l0oJ5K7pZ2M9bXWnN8P")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.kind).toBe("spotify")
      if (result.result.kind === "spotify") {
        expect(result.result.videoId).toBe("dQw4w9WgXcQ")
        expect(result.result.seedMetadata.source).toBe("spotify")
      }
    }
  })

  it("maps spotify resolver errors", async () => {
    mockResolveCanonical.mockResolvedValue({ ok: false, reason: "no_youtube_match" })
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
