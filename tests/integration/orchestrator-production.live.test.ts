import { beforeAll, describe, expect, it, vi } from "vitest"
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"

const runLive = process.env.RUN_LIVE_LYRICS === "1"
const apiBase = process.env.LYRICS_API_BASE ?? "https://umbra.nox-heights.workers.dev"

describe.runIf(runLive)("orchestrator live on production", () => {
  beforeAll(() => {
    vi.stubEnv("VITE_LYRICS_API_BASE", apiBase)
  })
  it("picks LRCLIB synced lyrics for Rick Astley", async () => {
    const result = await orchestrateLyricsSearch({
      track: "Never Gonna Give You Up",
      artist: "Rick Astley",
      title: "Rick Astley - Never Gonna Give You Up",
      durationSec: 214,
    })

    expect(result.status).toBe("found")
    expect(result.providerId).toBe("lrclib")
    expect(result.synced).toBe(true)
    const text = `${result.lyrics?.plainLyrics ?? ""}\n${result.lyrics?.syncedLyrics ?? ""}`
    expect(text.toLowerCase()).toContain("strangers to love")
  }, 90_000)

  it("picks LRCLIB synced lyrics for Queen", async () => {
    const result = await orchestrateLyricsSearch({
      track: "Bohemian Rhapsody",
      artist: "Queen",
      title: "Queen - Bohemian Rhapsody",
      durationSec: 355,
    })

    expect(result.status).toBe("found")
    expect(result.providerId).toBe("lrclib")
    expect(result.synced).toBe(true)
    const text = `${result.lyrics?.plainLyrics ?? ""}\n${result.lyrics?.syncedLyrics ?? ""}`
    expect(text.toLowerCase()).toMatch(/scaramouche|real life/)
  }, 90_000)
})
