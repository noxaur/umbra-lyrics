import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveSpotifyTrackToYouTube } from "@/lib/spotify-to-youtube"

vi.mock("@/lib/lyrics-providers/api-base", () => ({
  proxyFetch: vi.fn(),
}))

vi.mock("@/lib/youtube-search", () => ({
  searchSongs: vi.fn(),
}))

vi.mock("@/lib/canonical-music-video", () => ({
  resolveCanonicalMusicVideo: vi.fn(),
}))

import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { searchSongs } from "@/lib/youtube-search"
import { resolveCanonicalMusicVideo } from "@/lib/canonical-music-video"

const mockProxyFetch = vi.mocked(proxyFetch)
const mockSearchSongs = vi.mocked(searchSongs)
const mockResolveCanonical = vi.mocked(resolveCanonicalMusicVideo)

const TRACK_ID = "6F5l0oJ5K7pZ2M9bXWnN8P"
const SPOTIFY_URL = `https://open.spotify.com/track/${TRACK_ID}`

const spotifyTrack = {
  id: TRACK_ID,
  name: "Never Gonna Give You Up",
  artist: "Rick Astley",
  durationSec: 213,
  isrc: "USRC17607839",
}

describe("resolveSpotifyTrackToYouTube", () => {
  beforeEach(() => {
    mockProxyFetch.mockReset()
    mockSearchSongs.mockReset()
    mockResolveCanonical.mockReset()
  })

  it("returns invalid_url for non-Spotify input", async () => {
    mockResolveCanonical.mockResolvedValue({ ok: false, reason: "invalid_url" })
    const result = await resolveSpotifyTrackToYouTube("https://example.com")
    expect(result).toEqual({ ok: false, reason: "invalid_url" })
  })

  it("returns spotify_unavailable when track fetch fails", async () => {
    mockResolveCanonical.mockResolvedValue({ ok: false, reason: "spotify_unavailable" })

    const result = await resolveSpotifyTrackToYouTube(SPOTIFY_URL)
    expect(result).toEqual({ ok: false, reason: "spotify_unavailable" })
  })

  it("returns no_youtube_match when search is empty", async () => {
    mockResolveCanonical.mockResolvedValue({ ok: false, reason: "no_youtube_match" })

    const result = await resolveSpotifyTrackToYouTube(SPOTIFY_URL)
    expect(result).toEqual({ ok: false, reason: "no_youtube_match" })
    expect(mockResolveCanonical).toHaveBeenCalledWith(
      {
        kind: "spotify",
        input: SPOTIFY_URL,
      },
      undefined,
    )
  })

  it("returns no_youtube_match when all candidates score poorly", async () => {
    mockResolveCanonical.mockResolvedValue({ ok: false, reason: "metadata_unconfirmed" })

    const result = await resolveSpotifyTrackToYouTube(SPOTIFY_URL)
    expect(result).toEqual({ ok: false, reason: "no_youtube_match" })
  })

  it("returns best YouTube match by metadata score", async () => {
    mockResolveCanonical.mockResolvedValue({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      seedMetadata: {
        artist: spotifyTrack.artist,
        track: spotifyTrack.name,
        durationSec: spotifyTrack.durationSec,
        isrc: spotifyTrack.isrc,
        source: "spotify",
      },
    })

    const result = await resolveSpotifyTrackToYouTube(SPOTIFY_URL)
    expect(result).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      track: spotifyTrack,
    })
  })
})
