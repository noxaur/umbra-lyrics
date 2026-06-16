import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveSpotifyTrackToYouTube } from "@/lib/spotify-to-youtube"

vi.mock("@/lib/lyrics-providers/api-base", () => ({
  proxyFetch: vi.fn(),
}))

vi.mock("@/lib/youtube-search", () => ({
  searchSongs: vi.fn(),
}))

import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { searchSongs } from "@/lib/youtube-search"

const mockProxyFetch = vi.mocked(proxyFetch)
const mockSearchSongs = vi.mocked(searchSongs)

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
  })

  it("returns invalid_url for non-Spotify input", async () => {
    const result = await resolveSpotifyTrackToYouTube("https://example.com")
    expect(result).toEqual({ ok: false, reason: "invalid_url" })
  })

  it("returns spotify_unavailable when track fetch fails", async () => {
    mockProxyFetch.mockResolvedValue(new Response(null, { status: 502 }))

    const result = await resolveSpotifyTrackToYouTube(SPOTIFY_URL)
    expect(result).toEqual({ ok: false, reason: "spotify_unavailable" })
  })

  it("returns no_youtube_match when search is empty", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(JSON.stringify({ track: spotifyTrack }), { status: 200 }),
    )
    mockSearchSongs.mockResolvedValue([])

    const result = await resolveSpotifyTrackToYouTube(SPOTIFY_URL)
    expect(result).toEqual({ ok: false, reason: "no_youtube_match" })
    expect(mockSearchSongs).toHaveBeenCalledWith("Rick Astley Never Gonna Give You Up", {
      limit: 8,
      signal: undefined,
    })
  })

  it("returns best YouTube match by metadata score", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(JSON.stringify({ track: spotifyTrack }), { status: 200 }),
    )
    mockSearchSongs.mockResolvedValue([
      {
        videoId: "wrong123456",
        title: "Random Video",
        channel: "Other Channel",
        durationSec: 60,
      },
      {
        videoId: "dQw4w9WgXcQ",
        title: "Rick Astley - Never Gonna Give You Up",
        channel: "Rick Astley",
        durationSec: 213,
      },
    ])

    const result = await resolveSpotifyTrackToYouTube(SPOTIFY_URL)
    expect(result).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      track: spotifyTrack,
    })
  })
})
