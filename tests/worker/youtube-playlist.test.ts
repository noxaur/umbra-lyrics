import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  handleYouTubePlaylist,
  normalizePlaylistLimit,
} from "../../worker/handlers/youtube-playlist"
import { handleApiRequest } from "../../worker/router"
import { mapPlaylistVideo } from "../../worker/lib/youtube-playlist-map"

vi.mock("../../worker/lib/youtube-innertube", () => ({
  fetchPlaylistViaInnertube: vi.fn(),
}))

import { fetchPlaylistViaInnertube } from "../../worker/lib/youtube-innertube"

const mockFetch = vi.mocked(fetchPlaylistViaInnertube)

describe("youtube playlist map", () => {
  it("maps playlist videos and skips live entries", () => {
    expect(
      mapPlaylistVideo({
        id: "dQw4w9WgXcQ",
        title: { toString: () => "Artist - Track" },
        author: { name: "ArtistVEVO" },
        duration: { seconds: 240 },
        is_live: false,
        is_upcoming: false,
      }),
    ).toEqual({
      videoId: "dQw4w9WgXcQ",
      title: "Artist - Track",
      channel: "ArtistVEVO",
      durationSec: 240,
    })

    expect(
      mapPlaylistVideo({
        id: "live1234567",
        title: { toString: () => "Live show" },
        author: { name: "Channel" },
        duration: { seconds: 0 },
        is_live: true,
        is_upcoming: false,
      }),
    ).toBeNull()
  })
})

describe("youtube playlist handler", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("normalizes playlist limits", () => {
    expect(normalizePlaylistLimit(0)).toBe(1)
    expect(normalizePlaylistLimit(999)).toBe(100)
  })

  it("rejects missing playlist ids", async () => {
    const res = await handleYouTubePlaylist("", 10)
    expect(res.status).toBe(400)
  })

  it("returns mapped playlist data", async () => {
    mockFetch.mockResolvedValue({
      playlistId: "PLabc",
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
    })

    const res = await handleYouTubePlaylist("PLabc", 100)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { title: string; items: unknown[] }
    expect(body.title).toBe("Karaoke Mix")
    expect(body.items).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledWith("PLabc", 100)
  })

  it("is registered on the api router", async () => {
    mockFetch.mockResolvedValue({
      playlistId: "PLabc",
      title: "Karaoke Mix",
      items: [],
      truncated: false,
      totalReported: null,
    })

    const res = await handleApiRequest(
      new Request("https://song.example/api/youtube/playlist?id=PLabc&limit=50"),
    )
    expect(res?.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith("PLabc", 50)
  })
})
