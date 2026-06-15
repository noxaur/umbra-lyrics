import { describe, expect, it } from "vitest"
import { isJunkLyricLine, lyricsTextLooksLikeJunk, sanitizeLyricsText } from "@/lib/sanitize-lyrics"

describe("sanitize-lyrics", () => {
  it("removes scraper script noise", () => {
    const raw = [
      "Swim, swim",
      "Water falling off your skin",
      "/* Lyrics.net - TFP - Below */",
      "document.write('<scr' + 'ipt",
      "var opts = {",
      "})();",
    ].join("\n")

    const cleaned = sanitizeLyricsText(raw)
    expect(cleaned).toContain("Swim, swim")
    expect(cleaned).not.toContain("document.write")
    expect(cleaned).not.toContain("Lyrics.net")
  })

  it("keeps long lines that are not junk", () => {
    const longVerse = "A".repeat(300)
    expect(isJunkLyricLine(longVerse)).toBe(false)
    expect(sanitizeLyricsText(longVerse)).toBe(longVerse)
  })

  it("flags junk-heavy text", () => {
    expect(isJunkLyricLine("document.write('x')")).toBe(true)
    expect(isJunkLyricLine("遠い遠い別世界まで")).toBe(false)
    expect(
      lyricsTextLooksLikeJunk("line\n(function() {\nvar opts = {};\n})();"),
    ).toBe(true)
  })

  it("strips Genius contributor headers", () => {
    const raw = [
      "519 ContributorsTranslationsDeutschTürkçeEspañol",
      "I see a little silhouetto of a man",
      "Scaramouche, Scaramouche, will you do the Fandango?",
    ].join("\n")

    const cleaned = sanitizeLyricsText(raw)
    expect(cleaned).toContain("silhouetto of a man")
    expect(cleaned).not.toContain("Contributors")
    expect(cleaned).not.toContain("TranslationsDeutsch")
  })

  it("drops AZLyrics nav chrome", () => {
    const cleaned = sanitizeLyricsText("Queen Lyrics\nIs this the real life?")
    expect(cleaned).toBe("Is this the real life?")
  })
})
