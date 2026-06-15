import { describe, expect, it } from "vitest"
import {
  pickBestHit,
  PROVIDER_FALLBACK_ORDER,
  providerTimeoutMs,
  LRCLIB_TIMEOUT_MS,
  PROVIDER_TIMEOUT_MS,
  rankCandidates,
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
})
