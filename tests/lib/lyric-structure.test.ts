import { describe, it, expect } from "vitest"
import {
  parseLyricStructureTags,
  isStructureTagName,
  isInstrumentalSection,
} from "@/lib/lyric-structure"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { estimatePlainLyricsTiming } from "@/lib/plain-lyrics-timing"
import { getActiveLineIndex, getWordProgress } from "@/lib/sync-engine"

describe("parseLyricStructureTags", () => {
  it("classifies standalone structure tags", () => {
    const lines = parseLyricStructureTags("[Verse]\nHello\n[Chorus]\nWorld")
    expect(lines[0]).toMatchObject({
      text: "",
      sectionLabel: "Verse",
      isStructureOnly: true,
    })
    expect(lines[1]).toMatchObject({ text: "Hello", isStructureOnly: false })
    expect(lines[2]).toMatchObject({
      sectionLabel: "Chorus",
      isStructureOnly: true,
    })
    expect(lines[3]).toMatchObject({ text: "World", isStructureOnly: false })
  })

  it("recognizes numbered and hyphenated tags", () => {
    expect(isStructureTagName("Verse 2")).toBe(true)
    expect(isStructureTagName("Pre-Chorus")).toBe(true)
    expect(isStructureTagName("pre chorus")).toBe(true)
    expect(isStructureTagName("Bridge")).toBe(true)
    expect(isStructureTagName("Outro")).toBe(true)
    expect(isStructureTagName("Producer: Max")).toBe(false)
  })

  it("strips inline structure tags into label + lyric", () => {
    const lines = parseLyricStructureTags("[Verse 2] First line of verse")
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      text: "First line of verse",
      sectionLabel: "Verse 2",
      isStructureOnly: false,
    })
  })

  it("flags instrumental and break sections", () => {
    expect(isInstrumentalSection("Instrumental")).toBe(true)
    expect(isInstrumentalSection("Break")).toBe(true)
    expect(isInstrumentalSection("Interlude")).toBe(true)
    expect(isInstrumentalSection("Verse")).toBe(false)
    expect(isInstrumentalSection("Pre-Chorus")).toBe(false)

    const lines = parseLyricStructureTags("[Instrumental]\n[Verse]\nSing")
    expect(lines[0].isInstrumentalSection).toBe(true)
    expect(lines[1].isInstrumentalSection).toBeFalsy()
  })

  it("leaves non-structure bracket lines as plain text", () => {
    const lines = parseLyricStructureTags("[Not a real tag]")
    expect(lines[0]).toMatchObject({
      text: "[Not a real tag]",
      isStructureOnly: false,
    })
  })
})

describe("parsePlainLyrics with structure tags", () => {
  it("shows section labels by default (Spotify-style)", () => {
    const result = parsePlainLyrics("[Verse]\nHello world\n[Chorus]\nSing it loud", 120_000)
    expect(result.autoTimed).toBe(true)
    const sectionRows = result.lines.filter((l) => l.kind === "section")
    expect(sectionRows).toHaveLength(2)
    expect(sectionRows[0].sectionLabel).toBe("Verse")
    expect(sectionRows[1].sectionLabel).toBe("Chorus")
    expect(sectionRows.every((l) => l.startMs === l.endMs)).toBe(true)
  })

  it("hides section rows when showSectionLabels is false", () => {
    const result = parsePlainLyrics("[Verse]\nHello\n[Chorus]\nWorld", 90_000, {
      showSectionLabels: false,
    })
    expect(result.lines.every((l) => l.kind !== "section")).toBe(true)
    expect(result.lines.map((l) => l.text)).toEqual(["Hello", "World"])
  })

  it("attaches inline section labels to lyric rows", () => {
    const result = parsePlainLyrics("[Verse 2] Opening line\nNext line", 60_000)
    expect(result.lines.find((l) => l.text === "Opening line")?.sectionLabel).toBe("Verse 2")
    expect(result.lines.find((l) => l.text === "Next line")?.sectionLabel).toBeUndefined()
  })

  it("adds extra gap weight after instrumental sections", () => {
    const withBreak = estimatePlainLyricsTiming(
      parseLyricStructureTags("[Verse]\nLine one\n[Instrumental]\n[Verse]\nLine two"),
      120,
    )
    const withoutBreak = estimatePlainLyricsTiming(
      parseLyricStructureTags("[Verse]\nLine one\n[Verse]\nLine two"),
      120,
    )
    const breakLine = withBreak.find((l) => l.text === "Line two")!
    const plainLine = withoutBreak.find((l) => l.text === "Line two")!
    expect(breakLine.startMs).toBeGreaterThan(plainLine.startMs)
  })
})

describe("parseLrc with structure tags", () => {
  it("preserves timestamps and strips inline tags", () => {
    const result = parseLrc("[00:10.00][Verse 2] Hello there\n[00:15.00] Second line")
    expect(result.synced).toBe(true)
    expect(result.lines[0]).toMatchObject({
      startMs: 10_000,
      text: "Hello there",
      sectionLabel: "Verse 2",
      kind: "lyric",
    })
    expect(result.lines[0].endMs).toBe(15_000)
  })

  it("gives standalone tagged LRC lines zero duration", () => {
    const result = parseLrc("[00:10.00][Chorus]\n[00:12.00] Sing along")
    const chorus = result.lines.find((l) => l.kind === "section")
    expect(chorus).toMatchObject({
      startMs: 10_000,
      endMs: 10_000,
      sectionLabel: "Chorus",
    })
    expect(getActiveLineIndex(result.lines, 12_500, 0)).toBe(1)
    expect(getWordProgress(chorus!, 10_500)).toBe(0)
  })

  it("hides LRC section rows when showSectionLabels is false", () => {
    const result = parseLrc("[00:05.00][Bridge]\n[00:08.00] Cross it", 60_000, {
      showSectionLabels: false,
    })
    expect(result.lines.every((l) => l.kind !== "section")).toBe(true)
    expect(result.lines[0].text).toBe("Cross it")
  })
})
