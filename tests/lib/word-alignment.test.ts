import { describe, it, expect } from "vitest"
import { alignLinesToWords, parseEnhancedLrcWords } from "@/lib/word-alignment"
import type { LyricLine } from "@/types/lyrics"

describe("parseEnhancedLrcWords", () => {
  it("parses word-level LRC tags", () => {
    const words = parseEnhancedLrcWords("<00:01.00>Hello <00:01.50>world", 1000)
    expect(words).toHaveLength(2)
    expect(words[0].text).toBe("Hello")
    expect(words[0].startMs).toBe(1000)
    expect(words[1].text).toBe("world")
  })
})

describe("alignLinesToWords", () => {
  it("attaches word timestamps to lyric lines", () => {
    const lines: LyricLine[] = [
      { startMs: 0, endMs: 3000, text: "hello world" },
    ]
    const transcript = [
      { text: "hello", startMs: 100, endMs: 500 },
      { text: "world", startMs: 600, endMs: 1200 },
    ]
    const aligned = alignLinesToWords(lines, transcript)
    expect(aligned[0].words).toHaveLength(2)
    expect(aligned[0].words![0].startMs).toBe(100)
  })
})
