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

  it("parses structure tags in synced lyrics", () => {
    const result = parseLrc("[00:00.50][Intro]\n[00:05.00] First vocal")
    expect(result.lines[0].kind).toBe("section")
    expect(result.lines[0].sectionLabel).toBe("Intro")
    expect(result.lines[1].text).toBe("First vocal")
  })

  it("parses timestamps without fractional seconds", () => {
    const result = parseLrc("[00:12] Hello world\n[00:20.50] Second line")
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].startMs).toBe(12_000)
    expect(result.lines[0].text).toBe("Hello world")
  })

  it("parses hour-based timestamps", () => {
    const result = parseLrc("[00:01:05.00] Late in the song")
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].startMs).toBe(65_000)
    expect(result.lines[0].text).toBe("Late in the song")
  })

  it("skips metadata tags and applies [offset:] as sync adjustment", () => {
    const result = parseLrc("[ar:Artist]\n[ti:Track]\n[offset:+500]\n[00:12.00] Hello world")
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].text).toBe("Hello world")
    expect(result.suggestedOffsetMs).toBe(-500)
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
