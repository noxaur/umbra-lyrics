import { describe, expect, it } from "vitest"
import { buildChapterMarkers, chaptersToFfmetadata } from "@/lib/mkv-export/chapters"
import { englishLinesToSrt } from "@/lib/mkv-export/english-srt"
import { formatSrtTimestamp, linesToSrt } from "@/lib/mkv-export/srt"
import type { LyricLine } from "@/types/lyrics"

const sampleLines: LyricLine[] = [
  { startMs: 5000, endMs: 8000, text: "First line", kind: "lyric" },
  {
    startMs: 8000,
    endMs: 8000,
    text: "",
    sectionLabel: "Chorus",
    kind: "section",
  },
  { startMs: 8000, endMs: 12000, text: "Chorus line", sectionLabel: "Chorus", kind: "lyric" },
]

describe("formatSrtTimestamp", () => {
  it("formats zero", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000")
  })

  it("formats with offset", () => {
    expect(formatSrtTimestamp(65_500)).toBe("00:01:05,500")
  })
})

describe("linesToSrt", () => {
  it("emits SubRip blocks for vocal lines", () => {
    const srt = linesToSrt(sampleLines, 0, 60_000)
    expect(srt).toContain("00:00:05,000 --> 00:00:08,000")
    expect(srt).toContain("First line")
    expect(srt).toContain("Chorus line")
    expect(srt).not.toContain("Chorus\n")
  })

  it("applies sync offset", () => {
    const srt = linesToSrt(sampleLines, 500, 60_000)
    expect(srt).toContain("00:00:05,500 -->")
  })
})

describe("englishLinesToSrt", () => {
  it("aligns english to vocal line timestamps", () => {
    const srt = englishLinesToSrt(sampleLines, ["Line one", "Chorus english"], 0, 60_000)
    expect(srt).toContain("Line one")
    expect(srt).toContain("Chorus english")
    expect(srt).toContain("00:00:05,000")
  })

  it("skips empty english lines", () => {
    const srt = englishLinesToSrt(sampleLines, ["Line one", ""], 0, 60_000)
    expect(srt).toContain("Line one")
    expect(srt).not.toContain("Chorus english")
  })
})

describe("buildChapterMarkers", () => {
  it("adds intro chapter when vocals start late", () => {
    const markers = buildChapterMarkers(sampleLines, 0, 60_000)
    expect(markers[0]).toEqual({ startMs: 0, title: "Intro" })
  })

  it("adds section chapters", () => {
    const markers = buildChapterMarkers(sampleLines, 0, 60_000)
    expect(markers.some((m) => m.title === "Chorus")).toBe(true)
  })
})

describe("chaptersToFfmetadata", () => {
  it("produces ffmetadata chapters", () => {
    const markers = buildChapterMarkers(sampleLines, 0, 60_000)
    const meta = chaptersToFfmetadata(markers, 60_000)
    expect(meta).toContain(";FFMETADATA1")
    expect(meta).toContain("[CHAPTER]")
    expect(meta).toContain("title=Intro")
    expect(meta).toContain("START=0")
  })
})
