import { describe, expect, it, vi, beforeEach } from "vitest"
import { resolveTrackMetadata } from "@/lib/track-metadata-resolver"

vi.mock("@/lib/lyrics-providers/api-base", () => ({
  proxyFetch: vi.fn(),
}))

import { proxyFetch } from "@/lib/lyrics-providers/api-base"

const mockFetch = vi.mocked(proxyFetch)

describe("resolveTrackMetadata", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("prefers spotify hit over parse fallback", async () => {
    mockFetch.mockImplementation(async (path) => {
      if (path.includes("/api/metadata/spotify")) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                id: "sp1",
                name: "The Chain",
                artist: "Fleetwood Mac",
                durationSec: 270,
              },
            ],
          }),
        )
      }
      if (path.includes("musicbrainz")) {
        return new Response(JSON.stringify({ recordings: [] }))
      }
      if (path.includes("deezer") || path.includes("itunes")) {
        return new Response(JSON.stringify({ hits: [] }))
      }
      return new Response(JSON.stringify({ hits: [] }))
    })

    const resolved = await resolveTrackMetadata({
      title: "Fleetwood Mac - The Chain (Official Video)",
      durationSec: 270,
      roughArtist: "Fleetwood Mac",
      roughTrack: "The Chain",
    })

    expect(resolved.source).toBe("spotify")
    expect(resolved.artist).toBe("Fleetwood Mac")
    expect(resolved.track).toBe("The Chain")
    expect(resolved.confidence).toBeGreaterThan(0.5)
  })

  it("falls back to parse when all APIs fail", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ hits: [] })))

    const resolved = await resolveTrackMetadata({
      title: "別世界 - 天音かなた",
      durationSec: 240,
      roughArtist: "天音かなた",
      roughTrack: "別世界",
    })

    expect(resolved.track).toBe("別世界")
    expect(resolved.artist).toBe("天音かなた")
  })

  it("prefers Topic channel artist when APIs return a match", async () => {
    mockFetch.mockImplementation(async (path) => {
      if (path.includes("/api/metadata/spotify")) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                id: "sp1",
                name: "Bohemian Rhapsody",
                artist: "Queen",
                durationSec: 355,
              },
            ],
          }),
        )
      }
      if (path.includes("musicbrainz")) {
        return new Response(JSON.stringify({ recordings: [] }))
      }
      return new Response(JSON.stringify({ hits: [] }))
    })

    const resolved = await resolveTrackMetadata({
      title: "Bohemian Rhapsody",
      durationSec: 355,
      oembedAuthor: "Queen - Topic",
      roughArtist: "Queen",
      roughTrack: "Bohemian Rhapsody",
    })

    expect(resolved.source).toBe("spotify")
    expect(resolved.artist).toBe("Queen")
    expect(resolved.track).toBe("Bohemian Rhapsody")
  })
})
