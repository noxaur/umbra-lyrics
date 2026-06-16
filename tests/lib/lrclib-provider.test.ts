import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  fetchLyricsById,
  fetchLyricsByMetadata,
  searchByParams,
  searchByQuery,
} from "@/lib/lyrics-service"
import { lrclibProvider, searchLrclibWithStrategies } from "@/lib/lyrics-providers/lrclib-provider"

vi.mock("@/lib/lyrics-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lyrics-service")>()
  return {
    ...actual,
    searchByParams: vi.fn(actual.searchByParams),
    searchByQuery: vi.fn(actual.searchByQuery),
    fetchLyricsById: vi.fn(actual.fetchLyricsById),
    fetchLyricsByMetadata: vi.fn(actual.fetchLyricsByMetadata),
  }
})

describe("searchLrclibWithStrategies", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(searchByParams).mockReset()
    vi.mocked(searchByQuery).mockReset()
  })

  it("deduplicates results by id across strategies", async () => {
    vi.mocked(searchByParams).mockResolvedValueOnce([
      {
        id: 1,
        trackName: "Song",
        artistName: "Artist",
        duration: 200,
        plainLyrics: "From params",
      },
    ])
    vi.mocked(searchByQuery).mockResolvedValueOnce([
      {
        id: 1,
        trackName: "Song",
        artistName: "Artist",
        duration: 200,
        plainLyrics: "From query",
      },
    ])

    const candidates = await searchLrclibWithStrategies({
      track: "Song",
      artist: "Artist",
      durationSec: 200,
      title: "Artist - Song",
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.externalId).toBe(1)
  })

  it("runs strategies concurrently", async () => {
    let inFlight = 0
    let maxInFlight = 0

    vi.mocked(searchByParams).mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight -= 1
      return []
    })
    vi.mocked(searchByQuery).mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight -= 1
      return []
    })

    await searchLrclibWithStrategies({
      track: "Song",
      artist: "Artist",
      durationSec: 200,
      title: "Artist - Song",
    })

    expect(maxInFlight).toBeGreaterThan(1)
  })

  it("ignores rejected strategies", async () => {
    vi.mocked(searchByParams).mockRejectedValueOnce(new Error("fail"))
    vi.mocked(searchByQuery).mockResolvedValueOnce([
      {
        id: 2,
        trackName: "Song",
        artistName: "Artist",
        duration: 200,
        plainLyrics: "Recovered",
      },
    ])

    const candidates = await searchLrclibWithStrategies({
      track: "Song",
      artist: "Artist",
      durationSec: 200,
      title: "Artist - Song",
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.plainLyrics).toBe("Recovered")
  })
})

describe("lrclibProvider.search", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(searchByParams).mockReset()
    vi.mocked(searchByQuery).mockReset()
    vi.mocked(fetchLyricsById).mockReset()
    vi.mocked(fetchLyricsByMetadata).mockReset()
  })

  it("skips get fetches when search already has lyrics", async () => {
    vi.mocked(searchByParams).mockResolvedValue([
      {
        id: 1,
        trackName: "Song",
        artistName: "Artist",
        duration: 200,
        plainLyrics: "Line one\nTwo\nThree\nFour",
      },
      {
        id: 2,
        trackName: "Song alt",
        artistName: "Artist",
        duration: 201,
        plainLyrics: "Alt one\nTwo\nThree\nFour",
      },
    ])
    vi.mocked(searchByQuery).mockResolvedValue([])

    const candidates = await lrclibProvider.search({
      track: "Song",
      artist: "Artist",
      durationSec: 200,
      title: "Artist - Song",
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(vi.mocked(fetchLyricsById)).not.toHaveBeenCalled()
    expect(vi.mocked(fetchLyricsByMetadata)).not.toHaveBeenCalled()
  })

  it("resolves lyric-less candidates in parallel", async () => {
    let inFlight = 0
    let maxInFlight = 0

    vi.mocked(searchByParams).mockResolvedValue([
      { id: 1, trackName: "A", artistName: "Artist", duration: 200 },
      { id: 2, trackName: "B", artistName: "Artist", duration: 200 },
      { id: 3, trackName: "C", artistName: "Artist", duration: 200 },
    ])
    vi.mocked(searchByQuery).mockResolvedValue([])
    vi.mocked(fetchLyricsByMetadata).mockResolvedValue(null)
    vi.mocked(fetchLyricsById).mockImplementation(async (id: number) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight -= 1
      return {
        id,
        providerId: "lrclib" as const,
        plainLyrics: `Lyrics ${id}\nTwo\nThree\nFour`,
        syncedLyrics: null,
      }
    })

    const candidates = await lrclibProvider.search({
      track: "Song",
      artist: "Artist",
      durationSec: 200,
      title: "Artist - Song",
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it("returns synced best without get fetches when match is strong", async () => {
    vi.mocked(searchByParams).mockResolvedValue([
      {
        id: 1,
        trackName: "Song",
        artistName: "Artist",
        duration: 200,
        plainLyrics: "Line one\nTwo\nThree\nFour",
        syncedLyrics: "[00:00.00] Line one\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four",
      },
      {
        id: 2,
        trackName: "Song alt",
        artistName: "Artist",
        duration: 201,
        plainLyrics: null,
        syncedLyrics: null,
      },
    ])
    vi.mocked(searchByQuery).mockResolvedValue([])

    const candidates = await lrclibProvider.search({
      track: "Song",
      artist: "Artist",
      durationSec: 200,
      title: "Artist - Song",
    })

    expect(candidates).toHaveLength(1)
    expect(vi.mocked(fetchLyricsById)).not.toHaveBeenCalled()
  })
})
