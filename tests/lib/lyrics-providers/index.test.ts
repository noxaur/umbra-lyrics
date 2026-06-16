import { describe, expect, it, vi } from "vitest"
import {
  isDefinitiveLrclibSyncedWin,
  pickBestHit,
  PROVIDER_FALLBACK_ORDER,
  providerTimeoutMs,
  LRCLIB_TIMEOUT_MS,
  PROVIDER_TIMEOUT_MS,
  rankCandidates,
  searchProvidersParallel,
} from "@/lib/lyrics-providers"
import type { ProviderLyricsCandidate } from "@/lib/lyrics-providers/types"

function candidate(
  overrides: Partial<ProviderLyricsCandidate> & Pick<ProviderLyricsCandidate, "providerId">,
): ProviderLyricsCandidate {
  return {
    externalId: "1",
    trackName: "Song",
    artistName: "Artist",
    plainLyrics: "line",
    syncedLyrics: null,
    synced: false,
    confidence: 10,
    ...overrides,
  }
}

describe("lyrics-providers index", () => {
  it("defines fallback order with lrclib first", () => {
    expect(PROVIDER_FALLBACK_ORDER[0]).toBe("lrclib")
    expect(PROVIDER_FALLBACK_ORDER).toContain("lyrics-ovh")
    expect(PROVIDER_FALLBACK_ORDER).toContain("musicbrainz")
    expect(PROVIDER_FALLBACK_ORDER).toContain("chartlyrics")
    expect(PROVIDER_FALLBACK_ORDER).toContain("genius")
    expect(PROVIDER_FALLBACK_ORDER).toContain("petitlyrics")
  })

  it("gives LRCLIB a longer timeout than other providers", () => {
    expect(providerTimeoutMs("lrclib")).toBe(LRCLIB_TIMEOUT_MS)
    expect(providerTimeoutMs("genius")).toBe(PROVIDER_TIMEOUT_MS)
    expect(LRCLIB_TIMEOUT_MS).toBeGreaterThan(PROVIDER_TIMEOUT_MS)
    expect(LRCLIB_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000)
  })

  it("ranks synced lrclib above plain ovh", () => {
    const ranked = rankCandidates([
      candidate({ providerId: "lyrics-ovh", synced: false, confidence: 0 }),
      candidate({
        providerId: "lrclib",
        synced: true,
        syncedLyrics: "[00:00.00] line",
        confidence: 5,
      }),
    ])
    expect(ranked[0]?.providerId).toBe("lrclib")
  })

  it("pickBestHit returns normalized result", () => {
    const hit = pickBestHit([
      candidate({
        providerId: "megalobiz",
        externalId: "99",
        syncedLyrics: "[00:01.00] Hello",
        synced: true,
      }),
    ])
    expect(hit?.result.providerId).toBe("megalobiz")
    expect(hit?.result.id).toBe("99")
    expect(hit?.result.synced).toBe(true)
  })

  it("detects definitive lrclib synced wins", () => {
    const definitive = isDefinitiveLrclibSyncedWin(
      [
        candidate({
          providerId: "lrclib",
          externalId: 1,
          synced: true,
          syncedLyrics: "[00:00.00] One\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four",
          plainLyrics: "One\nTwo\nThree\nFour",
          confidence: 0,
        }),
      ],
      { track: "Song", artist: "Artist", durationSec: 200 },
    )
    expect(definitive).toBe(true)
  })

  it("exits provider search early on definitive lrclib synced win", async () => {
    let slowProviderStarted = false

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/lyrics/lrclib") || url.includes("/search")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                trackName: "Song",
                artistName: "Artist",
                duration: 200,
                plainLyrics: "One\nTwo\nThree\nFour",
                syncedLyrics: "[00:00.00] One\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four",
              },
            ]),
            { status: 200 },
          )
        }
        if (url.includes("/api/lyrics/ovh")) {
          slowProviderStarted = true
          await new Promise((resolve) => setTimeout(resolve, 500))
          return new Response(JSON.stringify({ lyrics: "slow" }), { status: 200 })
        }
        return new Response("[]", { status: 200 })
      }),
    )

    const startedAt = Date.now()
    const { candidates } = await searchProvidersParallel({
      params: { track: "Song", artist: "Artist", durationSec: 200 },
      providerIds: ["lrclib", "lyrics-ovh"],
    })
    const elapsed = Date.now() - startedAt

    expect(candidates.some((c) => c.providerId === "lrclib" && c.synced)).toBe(true)
    expect(elapsed).toBeLessThan(400)
    expect(slowProviderStarted).toBe(true)
  })
})
