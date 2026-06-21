import { beforeEach, describe, expect, it, vi } from "vitest"

const innertubeCreate = vi.fn()

vi.mock("youtubei.js/cf-worker", () => ({
  ClientType: { MUSIC: 2, WEB: 1 },
  Innertube: {
    create: (...args: unknown[]) => innertubeCreate(...args),
  },
}))

vi.mock("../src/lib/youtube-playlist-rss", () => ({
  fetchPlaylistViaRss: vi.fn().mockResolvedValue(null),
}))

async function loadFetchPlaylist() {
  vi.resetModules()
  const mod = await import("../src/lib/youtube-innertube")
  return mod.fetchPlaylistViaInnertube
}

describe("fetchPlaylistViaInnertube", () => {
  beforeEach(() => {
    innertubeCreate.mockReset()
  })

  it("rejects mix playlist ids before Innertube.create", async () => {
    const fetchPlaylistViaInnertube = await loadFetchPlaylist()

    await expect(
      fetchPlaylistViaInnertube("RDMM", 100, {
        sourceUrl: "https://www.youtube.com/watch?v=5MWcRauCR4w&list=RDMM&start_radio=1",
      }),
    ).rejects.toThrow(/mix playlist cannot be imported/)

    expect(innertubeCreate).not.toHaveBeenCalled()
  })

  it("skips watch-url getInfo for standard PL playlists", async () => {
    const fetchPlaylistViaInnertube = await loadFetchPlaylist()
    const getInfo = vi.fn()
    const getPlaylist = vi.fn().mockRejectedValue(new Error("browse failed"))
    innertubeCreate.mockResolvedValue({ getInfo, getPlaylist })

    await expect(
      fetchPlaylistViaInnertube("PLabc", 10, {
        sourceUrl: "https://www.youtube.com/watch?v=vid&list=PLabc",
      }),
    ).rejects.toThrow("browse failed")

    expect(getInfo).not.toHaveBeenCalled()
    expect(getPlaylist).toHaveBeenCalledWith("PLabc")
  })

  it("falls back from MUSIC to WEB when the first client returns no items", async () => {
    const fetchPlaylistViaInnertube = await loadFetchPlaylist()
    const emptyPlaylist = {
      videos: [],
      has_continuation: false,
      info: { title: "Empty", total_items: 0 },
      getContinuation: vi.fn(),
    }
    const webPlaylist = {
      videos: [
        {
          type: "PlaylistVideo",
          id: "vid123",
          title: { toString: () => "Track" },
          author: { name: "Artist" },
          duration: { seconds: 200 },
          is_live: false,
          is_upcoming: false,
        },
      ],
      has_continuation: false,
      info: { title: "Web playlist", total_items: 1 },
      getContinuation: vi.fn(),
    }
    innertubeCreate.mockImplementation((options: { client_type?: number }) => {
      const getPlaylist =
        options.client_type === 2
          ? vi.fn().mockResolvedValue(emptyPlaylist)
          : vi.fn().mockResolvedValue(webPlaylist)
      return Promise.resolve({ getInfo: vi.fn(), getPlaylist })
    })

    const result = await fetchPlaylistViaInnertube("PLabc", 10)

    expect(innertubeCreate).toHaveBeenCalledTimes(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.videoId).toBe("vid123")
  })
})
