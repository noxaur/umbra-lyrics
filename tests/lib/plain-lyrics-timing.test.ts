import { describe, it, expect } from "vitest"
import {
  estimateLineWeight,
  estimatePlainLyricsTiming,
} from "@/lib/plain-lyrics-timing"

describe("estimateLineWeight", () => {
  it("weights CJK by character count", () => {
    expect(estimateLineWeight("君の名は")).toBeGreaterThan(estimateLineWeight("Hi"))
  })

  it("adds pause bonus for ending punctuation", () => {
    const plain = estimateLineWeight("Hello world")
    const punct = estimateLineWeight("Hello world.")
    expect(punct).toBeGreaterThan(plain)
  })

  it("returns zero for empty lines", () => {
    expect(estimateLineWeight("   ")).toBe(0)
  })

  it("weights latin by syllable groups", () => {
    expect(estimateLineWeight("beautiful")).toBeGreaterThan(estimateLineWeight("a"))
  })
})

describe("estimatePlainLyricsTiming", () => {
  it("returns empty for no lines", () => {
    expect(estimatePlainLyricsTiming([], 180)).toEqual([])
  })

  it("handles single line spanning vocal window", () => {
    const lines = estimatePlainLyricsTiming(["Only line"], 60)
    expect(lines).toHaveLength(1)
    expect(lines[0].startMs).toBeGreaterThanOrEqual(0)
    expect(lines[0].endMs).toBeLessThanOrEqual(60_000)
    expect(lines[0].endMs).toBeGreaterThan(lines[0].startMs)
  })

  it("respects min line duration when budget allows", () => {
    const texts = Array.from({ length: 20 }, (_, i) => `Line ${i}`)
    const lines = estimatePlainLyricsTiming(texts, 120, { minLineDurationMs: 1500 })
    for (const line of lines) {
      expect(line.endMs - line.startMs).toBeGreaterThanOrEqual(1500)
    }
  })

  it("longer lines get more time than short ones", () => {
    const lines = estimatePlainLyricsTiming(
      ["Hi", "This is a much longer lyric line with many syllables"],
      120,
    )
    expect(lines[1].endMs - lines[1].startMs).toBeGreaterThan(lines[0].endMs - lines[0].startMs)
  })

  it("weights longer lines more than shorter ones across scripts", () => {
    const jp = estimatePlainLyricsTiming(["短い", "これは少し長い日本語の歌詞行です"], 90)
    const en = estimatePlainLyricsTiming(["Short", "This is a somewhat longer English lyric line"], 90)
    expect(jp[1].endMs - jp[1].startMs).toBeGreaterThan(jp[0].endMs - jp[0].startMs)
    expect(en[1].endMs - en[1].startMs).toBeGreaterThan(en[0].endMs - en[0].startMs)
  })

  it("skips blank lines in output", () => {
    const lines = estimatePlainLyricsTiming(["First", "", "Third"], 60)
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.text)).toEqual(["First", "Third"])
  })

  it("covers full track with last line ending before outro", () => {
    const texts = ["A", "B", "C", "D", "E"]
    const lines = estimatePlainLyricsTiming(texts, 200)
    expect(lines[lines.length - 1].endMs).toBeLessThanOrEqual(200_000)
    expect(lines[0].startMs).toBeGreaterThan(0)
  })

  it("adds paragraph gaps between blank-line verses", () => {
    const text = "Verse one line\n\nVerse two starts here\nSecond line of verse two"
    const lines = estimatePlainLyricsTiming([text], 120)
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[1].startMs - lines[0].endMs).toBeGreaterThanOrEqual(1000)
  })

  it("locks chorus repeats globally, not only consecutive duplicates", () => {
    const chorus = "We are the champions"
    const texts = [chorus, "Bridge line here", chorus, "Another bridge", chorus]
    const lines = estimatePlainLyricsTiming(texts, 180)
    const chorusDurations = lines
      .filter((line) => line.text === chorus)
      .map((line) => line.endMs - line.startMs)
    expect(chorusDurations[0]).toBeCloseTo(chorusDurations[1], -2)
    expect(chorusDurations[0]).toBeCloseTo(chorusDurations[2], -2)
  })

  it("handles 100 lines without overflow", () => {
    const texts = Array.from({ length: 100 }, (_, i) => `Line number ${i + 1}`)
    const lines = estimatePlainLyricsTiming(texts, 300)
    expect(lines).toHaveLength(100)
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].startMs).toBeGreaterThanOrEqual(lines[i - 1].startMs)
    }
  })

  it("preserves monotonic start times", () => {
    const lines = estimatePlainLyricsTiming(["One", "Two", "Three"], 45)
    expect(lines[0].startMs).toBeLessThan(lines[1].startMs)
    expect(lines[1].startMs).toBeLessThan(lines[2].startMs)
  })

  it("caps individual line duration at max", () => {
    const long = "word ".repeat(80).trim()
    const lines = estimatePlainLyricsTiming([long], 600, { maxLineDurationMs: 12000 })
    expect(lines[0].endMs - lines[0].startMs).toBeLessThanOrEqual(12000)
  })

  it("reserves more intro/outro for instrumental-heavy tracks", () => {
    const lines = estimatePlainLyricsTiming(
      ["", "", "Vocal starts here", "Second line"],
      240,
      { introPaddingSec: 30, outroPaddingSec: 20 },
    )
    expect(lines[0].startMs).toBeGreaterThanOrEqual(30_000)
    expect(lines[lines.length - 1].endMs).toBeLessThanOrEqual(220_000)
  })

  it("detects leading blank lines as extended intro", () => {
    const withGaps = estimatePlainLyricsTiming(["", "", "Hello", "World"], 120)
    const without = estimatePlainLyricsTiming(["Hello", "World"], 120)
    expect(withGaps[0].startMs).toBeGreaterThan(without[0].startMs)
  })

  it("exports from sync-engine barrel", async () => {
    const mod = await import("@/lib/sync-engine")
    expect(mod.estimatePlainLyricsTiming).toBeTypeOf("function")
    expect(mod.canAutoTimePlainLyrics(60)).toBe(true)
  })
})
