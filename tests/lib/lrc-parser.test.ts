import { describe, it, expect } from "vitest"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"

describe("parseLrc", () => {
  it("parses timestamped lines", () => {
    const result = parseLrc("[00:17.12] Hello world\n[00:20.50] Second line")
    expect(result.synced).toBe(true)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].startMs).toBe(17120)
    expect(result.lines[0].text).toBe("Hello world")
    expect(result.lines[0].endMs).toBe(20500)
    expect(result.lines[1].endMs).toBeGreaterThan(20500)
  })
})

describe("parsePlainLyrics", () => {
  it("distributes lines evenly", () => {
    const result = parsePlainLyrics("Line one\nLine two\nLine three", 90000)
    expect(result.synced).toBe(false)
    expect(result.lines).toHaveLength(3)
    expect(result.lines[0].startMs).toBe(0)
    expect(result.lines[2].endMs).toBe(90000)
  })
})
