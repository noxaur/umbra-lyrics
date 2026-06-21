import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  handleYouTubePlaylist,
  normalizePlaylistLimit,
} from "../src/handlers/youtube-playlist"
import { handleApiRequest } from "../src/router"
import { mapPlaylistPanelVideo, mapPlaylistVideo } from "../../../shared/youtube/youtube-playlist-map"

vi.mock("../src/lib/youtube-innertube", () => ({
  fetchPlaylistViaInnertube: vi.fn(),
}))

import { fetchPlaylistViaInnertube } from "../src/lib/youtube-innertube"

const mockFetch = vi.mocked(fetchPlaylistViaInnertube)

describe("youtube playlist map", () => {
  it("maps playlist panel videos", () => {
    expect(
      mapPlaylistPanelVideo({
        video_id: "dQw4w9WgXcQ",
        title: { toString: () => "Artist - Track" },
        author: "ArtistVEVO",
        duration: { seconds: 240 },
      }),
    ).toEqual({
      videoId: "dQw4w9WgXcQ",
      title: "Artist - Track",
      channel: "ArtistVEVO",
      durationSec: 240,
    })
  })

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
    expect(mockFetch).toHaveBeenCalledWith("PLabc", 100, { sourceUrl: undefined })
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
      new Request(
        "https://song.example/api/youtube/playlist?id=PLabc&limit=50&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dx%26list%3DPLabc",
      ),
    )
    expect(res?.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith("PLabc", 50, {
      sourceUrl: "https://www.youtube.com/watch?v=x&list=PLabc",
    })
  })
})
