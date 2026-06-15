import { describe, expect, it } from "vitest"
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"
import { parseLrc } from "@/lib/lrc-parser"

const runLive = process.env.RUN_LIVE_LYRICS === "1"
const API_BASE = process.env.VITE_LYRICS_API_BASE ?? "https://song-kara.nox-heights.workers.dev"

describe.runIf(runLive)("Not Like Us sync on production", () => {
  const youtubeDurationSec = 354 // H58vbez_m4E official MV ~5:54

  it("picks LRCLIB with first vocal near MV intro (~27s), not album offset (~0s)", async () => {
    const result = await orchestrateLyricsSearch({
      track: "Not Like Us",
      artist: "Kendrick Lamar",
      title: "Kendrick Lamar - Not Like Us",
      durationSec: youtubeDurationSec,
    })

    expect(result.status).toBe("found")
    expect(result.providerId).toBe("lrclib")
    expect(result.synced).toBe(true)

    const synced = result.lyrics?.syncedLyrics ?? ""
    const parsed = parseLrc(synced, youtubeDurationSec * 1000)
    const firstVocal = parsed.lines.find((l) => l.kind !== "section" && l.text.trim())
    expect(firstVocal).toBeDefined()

    const firstStartSec = (firstVocal!.startMs ?? 0) / 1000
    console.log({
      matchId: result.matchId,
      firstLine: firstVocal?.text,
      firstStartSec,
      suggestedOffsetMs: parsed.suggestedOffsetMs,
    })

    // MV has ~27s intro before first vocal; album LRCs start near 0s
    expect(firstStartSec).toBeGreaterThan(20)
    expect(firstStartSec).toBeLessThan(35)
    // Intentional MV intro must not get auto-offset (was ~-2.6s and delayed lyrics)
    expect(parsed.suggestedOffsetMs ?? 0).toBe(0)
  }, 90_000)
})
