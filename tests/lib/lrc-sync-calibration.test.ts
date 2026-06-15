import { describe, expect, it } from "vitest"
import {
  calibrateSyncedLyrics,
  estimateIntroSyncOffsetMs,
  finalizeWordTimings,
} from "@/lib/lrc-sync-calibration"
import type { LyricLine } from "@/types/lyrics"

describe("lrc-sync-calibration", () => {
  it("scales timestamps when the LRC master exceeds track duration", () => {
    const lines: LyricLine[] = [
      { startMs: 0, endMs: 5000, text: "A" },
      { startMs: 300_000, endMs: 305_000, text: "B" },
    ]
    const calibrated = calibrateSyncedLyrics(lines, 240_000)
    expect(calibrated[1].startMs).toBeLessThan(240_000)
  })

  it("suggests negative offset for late first lyrics", () => {
    const lines: LyricLine[] = [{ startMs: 45_000, endMs: 48_000, text: "Late start" }]
    const offset = estimateIntroSyncOffsetMs(lines, 240_000)
    expect(offset).toBeLessThan(0)
  })

  it("finalizes word ends to the parent line window", () => {
    const lines: LyricLine[] = [
      {
        startMs: 1000,
        endMs: 4000,
        text: "hello world",
        words: [
          { text: "hello", startMs: 1000, endMs: 1500 },
          { text: "world", startMs: 2000, endMs: 2500 },
        ],
      },
    ]
    const finalized = finalizeWordTimings(lines)
    expect(finalized[0].words?.[1].endMs).toBe(4000)
  })
})
