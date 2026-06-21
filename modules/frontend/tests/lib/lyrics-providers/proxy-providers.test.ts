import { describe, expect, it, vi, beforeEach } from "vitest"
import { chartlyricsProvider } from "@/lib/lyrics-providers/chartlyrics-provider"
import { geniusProvider } from "@/lib/lyrics-providers/genius-provider"
import { petitlyricsProvider } from "@/lib/lyrics-providers/petitlyrics-provider"

describe("proxy lyrics providers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("chartlyrics provider maps proxy hits to candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              id: "1",
              trackName: "Yellow",
              artistName: "Coldplay",
              plainLyrics: "Look at the stars",
            },
          ],
        }),
      ),
    )

    const hits = await chartlyricsProvider.search({
      track: "Yellow",
      artist: "Coldplay",
      durationSec: 180,
    })
    expect(hits[0]?.providerId).toBe("chartlyrics")
    expect(hits[0]?.plainLyrics).toContain("stars")
    expect(hits[0]?.synced).toBe(false)
  })

  it("genius provider maps proxy hits with language hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              id: 10,
              trackName: "Yellow",
              artistName: "Coldplay",
              plainLyrics: "Look at the stars shining",
            },
          ],
        }),
      ),
    )

    const hits = await geniusProvider.search({
      track: "Yellow",
      artist: "Coldplay",
      durationSec: 180,
    })
    expect(hits[0]?.providerId).toBe("genius")
    expect(hits[0]?.languageHint).toBe("en")
  })

  it("petitlyrics provider marks synced hits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              id: "/lyrics/1",
              trackName: "Song",
              artistName: "Artist",
              syncedLyrics: "[00:10.00] Hello",
              plainLyrics: "Hello",
            },
          ],
        }),
      ),
    )

    const hits = await petitlyricsProvider.search({
      track: "Song",
      artist: "Artist",
      durationSec: 180,
    })
    expect(hits[0]?.synced).toBe(true)
    expect(hits[0]?.languageHint).toBe("ja")
  })
})
