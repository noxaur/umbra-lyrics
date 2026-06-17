import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveCanonicalMusicVideo } from "@/lib/canonical-music-video"

vi.mock("@/lib/lyrics-providers/api-base", () => ({
  proxyFetch: vi.fn(),
}))

vi.mock("@/lib/spotify-auth", () => ({
  ensureSpotifyAccessToken: vi.fn(),
  spotifyAuthHeaders: vi.fn(() => undefined),
}))

vi.mock("@/lib/track-metadata-resolver", () => ({
  resolveTrackMetadata: vi.fn(),
}))

vi.mock("@/lib/youtube-music-search", () => ({
  searchYouTubeMusicSongs: vi.fn(),
}))

import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { resolveTrackMetadata } from "@/lib/track-metadata-resolver"
import { searchYouTubeMusicSongs } from "@/lib/youtube-music-search"

const mockProxyFetch = vi.mocked(proxyFetch)
const mockResolveTrackMetadata = vi.mocked(resolveTrackMetadata)
const mockSearchYouTubeMusicSongs = vi.mocked(searchYouTubeMusicSongs)

describe("resolveCanonicalMusicVideo", () => {
  beforeEach(() => {
    mockProxyFetch.mockReset()
    mockResolveTrackMetadata.mockReset()
    mockSearchYouTubeMusicSongs.mockReset()
  })

  it("tries alternate parsed artist/title pairs until a music API confirms metadata", async () => {
    mockResolveTrackMetadata
      .mockResolvedValueOnce({
        artist: "Track Name",
        track: "Artist Name",
        source: "parse",
        confidence: 0.3,
        alternates: [],
      })
      .mockResolvedValueOnce({
        artist: "Artist Name",
        track: "Track Name",
        source: "deezer",
        confidence: 0.88,
        durationSec: 245,
        alternates: [],
      })
    mockSearchYouTubeMusicSongs.mockResolvedValue([
      {
        videoId: "canonical01",
        title: "Track Name",
        channel: "Artist Name - Topic",
        durationSec: 245,
        resultType: "song",
        isOfficialAudio: true,
      },
    ])

    const result = await resolveCanonicalMusicVideo({
      kind: "youtube",
      videoId: "original001",
      title: "Track Name - Artist Name",
      oembedAuthor: "Artist Name",
      durationSec: 245,
    })

    expect(result).toEqual({
      ok: true,
      videoId: "canonical01",
      seedMetadata: {
        artist: "Artist Name",
        track: "Track Name",
        durationSec: 245,
        source: "music-api",
      },
    })
    expect(mockResolveTrackMetadata).toHaveBeenCalledTimes(2)
  })

  it("keeps the original YouTube video when only parse fallback metadata is available", async () => {
    mockResolveTrackMetadata.mockResolvedValue({
      artist: "Artist",
      track: "Track",
      source: "parse",
      confidence: 0.4,
      alternates: [],
    })

    const result = await resolveCanonicalMusicVideo({
      kind: "youtube",
      videoId: "original001",
      title: "Artist - Track",
      oembedAuthor: "Artist",
    })

    expect(result).toEqual({ ok: false, reason: "metadata_unconfirmed" })
    expect(mockSearchYouTubeMusicSongs).not.toHaveBeenCalled()
  })

  it("tries the next parsed candidate when YouTube Music has no match for the first", async () => {
    mockResolveTrackMetadata
      .mockResolvedValueOnce({
        artist: "Wrong Artist",
        track: "Wrong Track",
        source: "deezer",
        confidence: 0.9,
        durationSec: 240,
        alternates: [],
      })
      .mockResolvedValueOnce({
        artist: "Artist Name",
        track: "Track Name",
        source: "deezer",
        confidence: 0.88,
        durationSec: 245,
        alternates: [],
      })
    mockSearchYouTubeMusicSongs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          videoId: "canonical01",
          title: "Track Name",
          channel: "Artist Name - Topic",
          durationSec: 245,
          resultType: "song",
          isOfficialAudio: true,
        },
      ])

    const result = await resolveCanonicalMusicVideo({
      kind: "youtube",
      videoId: "original001",
      title: "Track Name - Artist Name",
      oembedAuthor: "Artist Name",
      durationSec: 245,
    })

    expect(result).toEqual({
      ok: true,
      videoId: "canonical01",
      seedMetadata: {
        artist: "Artist Name",
        track: "Track Name",
        durationSec: 245,
        source: "music-api",
      },
    })
    expect(mockResolveTrackMetadata).toHaveBeenCalledTimes(2)
    expect(mockSearchYouTubeMusicSongs).toHaveBeenCalledTimes(2)
  })

  it("uses Spotify metadata as validated and searches YouTube Music", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          track: {
            id: "6F5l0oJ5K7pZ2M9bXWnN8P",
            name: "Never Gonna Give You Up",
            artist: "Rick Astley",
            durationSec: 213,
            isrc: "USRC17607839",
          },
        }),
      ),
    )
    mockSearchYouTubeMusicSongs.mockResolvedValue([
      {
        videoId: "dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        channel: "Rick Astley - Topic",
        durationSec: 213,
        resultType: "song",
        isOfficialAudio: true,
      },
    ])

    const result = await resolveCanonicalMusicVideo({
      kind: "spotify",
      input: "https://open.spotify.com/track/6F5l0oJ5K7pZ2M9bXWnN8P",
    })

    expect(result).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      seedMetadata: {
        artist: "Rick Astley",
        track: "Never Gonna Give You Up",
        durationSec: 213,
        isrc: "USRC17607839",
        source: "spotify",
      },
    })
  })
})
