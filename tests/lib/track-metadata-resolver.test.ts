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

  it("uses the oEmbed-backed seed when supplied rough metadata is skewed", async () => {
    const seen: string[] = []
    mockFetch.mockImplementation(async (path) => {
      seen.push(path)
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
      roughArtist: "Wrong Artist",
      roughTrack: "Wrong Song",
    })

    expect(seen.some((path) => path.includes("artist=Queen") && path.includes("track=Bohemian+Rhapsody"))).toBe(true)
    expect(resolved.artist).toBe("Queen")
    expect(resolved.track).toBe("Bohemian Rhapsody")
  })

  it("drops duplicate candidates that only differ by shared IDs", async () => {
    mockFetch.mockImplementation(async (path) => {
      if (path.includes("/api/metadata/spotify")) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                id: "shared",
                name: "Song",
                artist: "Artist",
                durationSec: 200,
                isrc: "abc123",
              },
            ],
          }),
        )
      }
      if (path.includes("musicbrainz")) {
        return new Response(
          JSON.stringify({
            recordings: [
              {
                id: "mb1",
                title: "Song",
                length: 200000,
                "artist-credit": [{ name: "Artist" }],
              },
              {
                id: "mb2",
                title: "Song",
                length: 200000,
                "artist-credit": [{ name: "Artist" }],
              },
            ],
          }),
        )
      }
      return new Response(JSON.stringify({ hits: [] }))
    })

    const resolved = await resolveTrackMetadata({
      title: "Artist - Song",
      durationSec: 200,
      roughArtist: "Artist",
      roughTrack: "Song",
    })

    expect(resolved.source).toBe("spotify")
    expect(resolved.alternates.filter((candidate) => candidate.source === "musicbrainz")).toHaveLength(2)
  })

  it("uses search seed for parse fallback when rough metadata is skewed and APIs fail", async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation(async (_path, init) => {
      const signal = init?.signal
      if (signal) {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true })
        })
      }
      throw new DOMException("The operation was aborted.", "AbortError")
    })

    const promise = resolveTrackMetadata({
      title: "Bohemian Rhapsody",
      durationSec: 355,
      oembedAuthor: "Queen - Topic",
      roughArtist: "Wrong Artist",
      roughTrack: "Wrong Song",
    })

    await vi.advanceTimersByTimeAsync(5_000)
    const resolved = await promise

    expect(resolved.source).toBe("parse")
    expect(resolved.artist).toBe("Queen")
    expect(resolved.track).toBe("Bohemian Rhapsody")
    vi.useRealTimers()
  })

  it("returns parse fallback when every fetch times out", async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation(async (_path, init) => {
      const signal = init?.signal
      if (signal) {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true })
        })
      }
      throw new DOMException("The operation was aborted.", "AbortError")
    })

    const promise = resolveTrackMetadata({
      title: "Artist - Song",
      durationSec: 200,
      roughArtist: "Artist",
      roughTrack: "Song",
    })

    await vi.advanceTimersByTimeAsync(5_000)
    const resolved = await promise

    expect(resolved.source).toBe("parse")
    expect(resolved.artist).toBe("Artist")
    expect(resolved.track).toBe("Song")
    vi.useRealTimers()
  })
})
