import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { decodeHtmlEntities } from "@/lib/decode-html-entities"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import { lyricsTextLooksLikeJunk } from "@/lib/sanitize-lyrics"

const FIXTURES = join(import.meta.dirname, "../fixtures/lyrics-quality")

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8")
}

describe("prepareLyricsText", () => {
  it("decodes numeric and named HTML entities", () => {
    const raw = loadFixture("html-entities.txt")
    const cleaned = prepareLyricsText(raw)
    expect(cleaned).toContain("It\u2019s a beautiful day")
    expect(cleaned).toContain("—")
    expect(cleaned).toContain("…")
    expect(cleaned).not.toContain("&#")
    expect(cleaned).not.toContain("&rsquo;")
  })

  it("removes scraper junk while keeping real lyrics", () => {
    const raw = loadFixture("scraper-junk.txt")
    const cleaned = prepareLyricsText(raw)
    expect(cleaned).toContain("Swim, swim")
    expect(cleaned).not.toContain("document.write")
    expect(lyricsTextLooksLikeJunk(cleaned)).toBe(false)
  })

  it("preserves long legitimate verses", () => {
    const longLine = "A".repeat(300)
    const cleaned = prepareLyricsText(longLine)
    expect(cleaned).toBe(longLine)
  })

  it("preserves enhanced LRC word tags", () => {
    const raw = "[00:01.00]<00:01.00>Hello <00:01.50>world"
    const cleaned = prepareLyricsText(raw)
    expect(cleaned).toContain("<00:01.00>Hello")
    expect(cleaned).toContain("<00:01.50>world")
  })

  it("detects musixmatch snippets as too short for full lyrics", () => {
    const snippet = prepareLyricsText(loadFixture("musixmatch-snippet.txt"))
    expect(snippet.split("\n").filter(Boolean)).toHaveLength(1)
    expect(snippet.length).toBeLessThan(80)
  })
})

describe("decodeHtmlEntities parity with worker decodeHtml", () => {
  it("matches worker html decoder for common cases", async () => {
    const { decodeHtml } = await import("../../worker/scraper/html")
    const samples = [
      "Hello<br>world &amp; friends",
      "It&#8217;s fine &mdash; really",
      "Du du <00:01.00>word",
    ]
    for (const sample of samples) {
      expect(decodeHtmlEntities(sample)).toBe(decodeHtml(sample))
    }
  })
})
