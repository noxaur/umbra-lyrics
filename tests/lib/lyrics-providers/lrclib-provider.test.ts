import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/lyrics-service", () => ({
  searchByParams: vi.fn(),
  searchByQuery: vi.fn(),
  fetchLyricsById: vi.fn(),
  fetchLyricsByMetadata: vi.fn(),
  hasLyrics: vi.fn((r: { plainLyrics?: string | null; syncedLyrics?: string | null }) =>
    Boolean(r.plainLyrics?.trim() || r.syncedLyrics?.trim()),
  ),
  pickBestMatch: vi.fn(),
}))

import { searchByParams, searchByQuery } from "@/lib/lyrics-service"
import { searchLrclibWithStrategies } from "@/lib/lyrics-providers/lrclib-provider"

const baseParams = {
  track: "Song",
  artist: "Artist",
  durationSec: 200,
  title: "Artist - Song",
}

describe("searchLrclibWithStrategies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchByParams).mockResolvedValue([])
    vi.mocked(searchByQuery).mockResolvedValue([])
  })

  it("runs strategies in parallel so elapsed time stays near the slowest call", async () => {
    const delayMs = 80
    vi.mocked(searchByParams).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, delayMs))
      return [
        {
          id: 1,
          trackName: "Song",
          artistName: "Artist",
          duration: 200,
          plainLyrics: "from params",
        },
      ]
    })
    vi.mocked(searchByQuery).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, delayMs))
      return []
    })

    const start = Date.now()
    const results = await searchLrclibWithStrategies(baseParams)
    const elapsed = Date.now() - start

    expect(results.some((c) => c.externalId === 1)).toBe(true)
    expect(elapsed).toBeLessThan(delayMs * 2.5)
    expect(searchByParams).toHaveBeenCalled()
    expect(searchByQuery).toHaveBeenCalled()
  })

  it("merges duplicate ids keeping the lowest confidence score", async () => {
    vi.mocked(searchByParams).mockResolvedValue([
      {
        id: 1,
        trackName: "Song",
        artistName: "Wrong Artist",
        duration: 300,
        plainLyrics: "worse match",
      },
    ])
    vi.mocked(searchByQuery).mockResolvedValue([
      {
        id: 1,
        trackName: "Song",
        artistName: "Artist",
        duration: 200,
        plainLyrics: "better match",
      },
    ])

    const results = await searchLrclibWithStrategies(baseParams)

    expect(results).toHaveLength(1)
    expect(results[0]?.artistName).toBe("Artist")
    expect(results[0]?.confidence).toBeLessThan(50)
  })

  it("swallows per-strategy errors without failing the whole search", async () => {
    vi.mocked(searchByParams).mockRejectedValue(new Error("network"))
    vi.mocked(searchByQuery).mockResolvedValue([
      {
        id: 2,
        trackName: "Song",
        artistName: "Artist",
        duration: 200,
        plainLyrics: "fallback lyrics",
      },
    ])

    const results = await searchLrclibWithStrategies(baseParams)

    expect(results).toHaveLength(1)
    expect(results[0]?.externalId).toBe(2)
  })
})
