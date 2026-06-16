import { beforeEach, describe, expect, it, vi } from "vitest"

const innertubeCreate = vi.fn()

vi.mock("youtubei.js/cf-worker", () => ({
  ClientType: { WEB: 1 },
  Innertube: {
    create: (...args: unknown[]) => innertubeCreate(...args),
  },
}))

import { fetchPlaylistViaInnertube } from "../../worker/lib/youtube-innertube"

describe("fetchPlaylistViaInnertube", () => {
  beforeEach(() => {
    innertubeCreate.mockReset()
  })

  it("rejects mix playlist ids before Innertube.create", async () => {
    await expect(
      fetchPlaylistViaInnertube("RDMM", 100, {
        sourceUrl: "https://www.youtube.com/watch?v=5MWcRauCR4w&list=RDMM&start_radio=1",
      }),
    ).rejects.toThrow(/mix playlist cannot be imported/)

    expect(innertubeCreate).not.toHaveBeenCalled()
  })

  it("skips watch-url getInfo for standard PL playlists", async () => {
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
})
