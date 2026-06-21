import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  fetchYouTubePlaylist,
  playlistItemsToCanonicalTracks,
  playlistItemsToTracks,
} from "@/lib/youtube-playlist"

vi.mock("@/lib/lyrics-providers/api-base", () => ({
  proxyFetch: vi.fn(),
}))

vi.mock("@/lib/canonical-music-video", () => ({
  resolveCanonicalMusicVideo: vi.fn(),
}))

vi.mock("@/lib/youtube-playlist-browser", () => ({
  fetchPlaylistInBrowser: vi.fn(),
}))

import { resolveCanonicalMusicVideo } from "@/lib/canonical-music-video"
import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { fetchPlaylistInBrowser } from "@/lib/youtube-playlist-browser"

const mockProxyFetch = vi.mocked(proxyFetch)
const mockBrowserFetch = vi.mocked(fetchPlaylistInBrowser)
const mockResolveCanonical = vi.mocked(resolveCanonicalMusicVideo)

const PL = "PLrAXtmRdnEQy6nuLMH8zzRaJfGBFXHm"
const URL = `https://www.youtube.com/playlist?list=${PL}`

describe("fetchYouTubePlaylist", () => {
  beforeEach(() => {
    mockProxyFetch.mockReset()
    mockBrowserFetch.mockReset()
    mockResolveCanonical.mockReset()
  })

  it("returns worker results when the API succeeds", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          playlistId: PL,
          title: "Karaoke Mix",
          items: [
            {
              videoId: "dQw4w9WgXcQ",
              title: "Artist - Track",
              channel: "ArtistVEVO",
              durationSec: 240,
            },
          ],
          truncated: false,
          totalReported: "12",
        }),
        { status: 200 },
      ),
    )

    const result = await fetchYouTubePlaylist(URL)
    expect(result.title).toBe("Karaoke Mix")
    expect(mockBrowserFetch).not.toHaveBeenCalled()
  })

  it("falls back to browser fetch when the worker returns an empty playlist", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          playlistId: PL,
          title: "Karaoke Mix",
          items: [],
          truncated: false,
          totalReported: null,
        }),
        { status: 200 },
      ),
    )
    mockBrowserFetch.mockResolvedValue({
      playlistId: PL,
      title: "Karaoke Mix",
      items: [
        {
          videoId: "dQw4w9WgXcQ",
          title: "Artist - Track",
          channel: "ArtistVEVO",
          durationSec: 240,
        },
      ],
      truncated: false,
      totalReported: null,
    })

    const result = await fetchYouTubePlaylist(URL)
    expect(result.items).toHaveLength(1)
    expect(mockBrowserFetch).toHaveBeenCalledWith(
      PL,
      100,
      expect.objectContaining({ sourceUrl: URL }),
    )
  })

  it("falls back to browser fetch when the worker API returns 502", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "YouTube playlist unavailable" }), { status: 502 }),
    )
    mockBrowserFetch.mockResolvedValue({
      playlistId: PL,
      title: "Karaoke Mix",
      items: [
        {
          videoId: "dQw4w9WgXcQ",
          title: "Artist - Track",
          channel: "ArtistVEVO",
          durationSec: 240,
        },
      ],
      truncated: false,
      totalReported: null,
    })

    const result = await fetchYouTubePlaylist(URL)
    expect(result.items).toHaveLength(1)
    expect(mockBrowserFetch).toHaveBeenCalled()
  })

  it("does not fall back when the worker request is aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    mockProxyFetch.mockRejectedValue(new DOMException("Aborted", "AbortError"))

    await expect(fetchYouTubePlaylist(URL, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(mockBrowserFetch).not.toHaveBeenCalled()
  })

  it("throws a friendly error when both worker and browser return no items", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          playlistId: PL,
          title: "Karaoke Mix",
          items: [],
          truncated: false,
          totalReported: "42",
        }),
        { status: 200 },
      ),
    )
    mockBrowserFetch.mockResolvedValue({
      playlistId: PL,
      title: "Karaoke Mix",
      items: [],
      truncated: false,
      totalReported: null,
    })

    await expect(fetchYouTubePlaylist(URL)).rejects.toThrow(
      "This playlist returned no importable videos. It may be private or require YouTube sign-in.",
    )
  })
})

describe("playlistItemsToCanonicalTracks", () => {
  beforeEach(() => {
    mockResolveCanonical.mockReset()
  })

  it("replaces playlist media with the canonical YouTube Music video when matched", async () => {
    mockResolveCanonical.mockResolvedValue({
      ok: true,
      videoId: "canonical01",
      seedMetadata: {
        artist: "Artist Name",
        track: "Track Name",
        durationSec: 240,
        source: "music-api",
      },
    })

    const tracks = await playlistItemsToCanonicalTracks([
      {
        videoId: "original01",
        title: "Track Name - Artist Name",
        channel: "Artist Name - Topic",
        durationSec: 240,
      },
    ])

    expect(tracks).toEqual([
      {
        videoId: "canonical01",
        title: "Track Name - Artist Name",
        artist: "Artist Name",
        track: "Track Name",
        mediaSource: "music.youtube",
      },
    ])
  })

  it("keeps the original video when canonical search has no confirmed match", async () => {
    mockResolveCanonical.mockResolvedValue({ ok: false, reason: "metadata_unconfirmed" })

    const tracks = await playlistItemsToCanonicalTracks([
      {
        videoId: "original01",
        title: "Track Name - Artist Name",
        channel: "Artist Name - Topic",
        durationSec: 240,
      },
    ])

    expect(tracks).toEqual(playlistItemsToTracks([
      {
        videoId: "original01",
        title: "Track Name - Artist Name",
        channel: "Artist Name - Topic",
        durationSec: 240,
      },
    ]))
  })
})
