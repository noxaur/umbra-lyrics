import { describe, expect, it } from "vitest"
import { detectLanguageHint, extractXmlTag, lrcToPlain } from "@/lib/lyrics-providers/normalize"

describe("lyrics normalize", () => {
  it("strips LRC timestamps to plain text", () => {
    const plain = lrcToPlain("[00:12.00] Hello\n[00:15.50] world")
    expect(plain).toBe("Hello\nworld")
  })

  it("extracts XML tags regardless of namespace", () => {
    const xml = `<GetLyricResult xmlns="http://api.chartlyrics.com/"><Lyric>Line one</Lyric></GetLyricResult>`
    expect(extractXmlTag(xml, "Lyric")).toBe("Line one")
  })

  it("detects Japanese language hint", () => {
    expect(detectLanguageHint("君の名は")).toBe("ja")
  })

  it("defaults to English for Latin text", () => {
    expect(detectLanguageHint("Hello world, this is a test")).toBe("en")
  })
})
