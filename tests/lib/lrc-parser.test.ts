import { describe, it, expect } from "vitest"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"

describe("parseLrc", () => {
  it("parses timestamped lines", () => {
    const result = parseLrc("[00:17.12] Hello world\n[00:20.50] Second line")
    expect(result.synced).toBe(true)
    expect(result.autoTimed).toBe(false)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].startMs).toBe(17120)
    expect(result.lines[0].text).toBe("Hello world")
    expect(result.lines[0].endMs).toBe(20500)
    expect(result.lines[1].endMs).toBeGreaterThan(20500)
  })
})

describe("parsePlainLyrics", () => {
  it("uses syllable-weighted auto-timing when duration is known", () => {
    const result = parsePlainLyrics("Hi\nThis is a much longer lyric line here", 90000)
    expect(result.synced).toBe(false)
    expect(result.autoTimed).toBe(true)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].startMs).toBeGreaterThan(0)
    const shortLine = result.lines[0].endMs - result.lines[0].startMs
    const longLine = result.lines[1].endMs - result.lines[1].startMs
    expect(longLine).toBeGreaterThan(shortLine)
  })

  it("falls back to even spacing without duration", () => {
    const result = parsePlainLyrics("A\nB\nC", 0)
    expect(result.autoTimed).toBe(false)
    expect(result.lines[0].startMs).toBe(0)
    expect(result.lines[2].endMs).toBe(0)
  })
})
