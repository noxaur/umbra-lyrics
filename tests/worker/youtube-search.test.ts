import { beforeEach, describe, expect, it, vi } from "vitest"
import { handleYouTubeSearch, normalizeSearchLimit } from "../../worker/handlers/youtube-search"
import { handleApiRequest } from "../../worker/router"

vi.mock("../../worker/lib/youtube-innertube", () => ({
  searchViaInnertube: vi.fn(),
}))

import { searchViaInnertube } from "../../worker/lib/youtube-innertube"

const mockSearch = vi.mocked(searchViaInnertube)

describe("youtube search handler", () => {
  beforeEach(() => {
    mockSearch.mockReset()
  })

  it("normalizes search limits", () => {
    expect(normalizeSearchLimit(0)).toBe(1)
    expect(normalizeSearchLimit(99)).toBe(20)
    expect(normalizeSearchLimit(5.9)).toBe(5)
  })

  it("rejects short queries", async () => {
    const res = await handleYouTubeSearch("a", 10)
    expect(res.status).toBe(400)
  })

  it("returns mapped results", async () => {
    mockSearch.mockResolvedValue([
      {
        videoId: "dQw4w9WgXcQ",
        title: "Artist - Track",
        channel: "ArtistVEVO",
        durationSec: 240,
      },
    ])

    const res = await handleYouTubeSearch("artist track", 10)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { query: string; results: unknown[] }
    expect(body.query).toBe("artist track")
    expect(body.results).toHaveLength(1)
    expect(mockSearch).toHaveBeenCalledWith("artist track", 10)
  })

  it("returns 502 when innertube search fails", async () => {
    mockSearch.mockRejectedValue(new Error("boom"))
    const res = await handleYouTubeSearch("queen", 10)
    expect(res.status).toBe(502)
  })

  it("is registered on the api router", async () => {
    mockSearch.mockResolvedValue([])
    const res = await handleApiRequest(
      new Request("https://song.example/api/youtube/search?q=queen&limit=5"),
    )
    expect(res?.status).toBe(200)
    expect(mockSearch).toHaveBeenCalledWith("queen", 5)
  })
})
