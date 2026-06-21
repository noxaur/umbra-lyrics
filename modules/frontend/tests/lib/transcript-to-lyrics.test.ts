import { describe, expect, it } from "vitest"
import {
  groupSegmentsIntoLines,
  segmentsToLyricLines,
  transcriptToPlainLyrics,
} from "@/lib/transcript-to-lyrics"

describe("transcript-to-lyrics", () => {
  const sampleSegments = [
    { start: 1.0, end: 2.5, text: "Hello world" },
    { start: 2.6, end: 4.0, text: "this is karaoke" },
    { start: 5.0, end: 6.5, text: "next line here" },
  ]

  it("converts segment times to milliseconds", () => {
    const lines = segmentsToLyricLines(sampleSegments, 120_000)
    expect(lines.lines.length).toBeGreaterThan(0)
    expect(lines.synced).toBe(true)
    expect(lines.aligned).toBe(true)
    expect(lines.lines[0].startMs).toBeGreaterThanOrEqual(1000)
    expect(lines.lines[0].words?.length).toBeGreaterThan(0)
  })

  it("groups segments into lines on long pauses", () => {
    const grouped = groupSegmentsIntoLines(sampleSegments)
    expect(grouped.length).toBe(2)
    expect(grouped[0].segments).toHaveLength(2)
    expect(grouped[1].segments).toHaveLength(1)
  })

  it("returns empty for no segments", () => {
    const parsed = segmentsToLyricLines([], 60_000)
    expect(parsed.lines).toHaveLength(0)
    expect(parsed.synced).toBe(false)
  })

  it("builds plain lyrics text", () => {
    const text = transcriptToPlainLyrics(sampleSegments)
    expect(text).toContain("Hello world")
    expect(text).toContain("next line here")
    expect(text.split("\n").length).toBe(2)
  })

  it("handles a single segment", () => {
    const parsed = segmentsToLyricLines([{ start: 0, end: 3, text: "solo line" }], 30_000)
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.lines[0].text).toBe("solo line")
  })
})
