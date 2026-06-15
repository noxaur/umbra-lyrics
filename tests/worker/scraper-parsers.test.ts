import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { isAllowedUrl } from "../../worker/scraper/allowlist"
import { parseAzLyricsHtml, buildAzLyricsUrl } from "../../worker/scraper/extractors/azlyrics"
import {
  parseAnimelyricsHtml,
  parseLyricalNonsenseHtml,
} from "../../worker/scraper/extractors/anime"
import { parseGeniusLyricsHtml, parseGeniusSearchJson } from "../../worker/scraper/extractors/genius"
import { parseLyricsComLyricsHtml } from "../../worker/scraper/extractors/lyricscom"
import { parseMusixmatchSnippets } from "../../worker/scraper/extractors/musixmatch"
import { decodeHtml, slugifyAz } from "../../worker/scraper/html"

const FIXTURES = join(import.meta.dirname, "../fixtures/scraper")

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8")
}

describe("scraper allowlist", () => {
  it("allows known lyric hosts", () => {
    expect(isAllowedUrl("https://genius.com/song")).toBe(true)
    expect(isAllowedUrl("https://www.azlyrics.com/lyrics/coldplay/yellow.html")).toBe(true)
    expect(isAllowedUrl("https://raw.githubusercontent.com/foo/bar.lrc")).toBe(true)
  })

  it("blocks arbitrary hosts", () => {
    expect(isAllowedUrl("https://evil.example/steal")).toBe(false)
  })
})

describe("html utilities", () => {
  it("decodes entities and line breaks", () => {
    expect(decodeHtml("Hello<br>world &amp; friends")).toBe("Hello\nworld & friends")
  })

  it("slugifies for AZLyrics URLs", () => {
    expect(slugifyAz("Coldplay")).toBe("coldplay")
    expect(buildAzLyricsUrl("Coldplay", "Yellow")).toBe(
      "https://www.azlyrics.com/lyrics/coldplay/yellow.html",
    )
  })
})

describe("genius parser", () => {
  it("extracts lyrics from data-lyrics-container", () => {
    const html = loadFixture("genius-lyrics.html")
    const lyrics = parseGeniusLyricsHtml(html)
    expect(lyrics).toContain("Look at the stars")
    expect(lyrics).toContain("shine for you")
  })

  it("parses search JSON hits", () => {
    const hits = parseGeniusSearchJson({
      response: {
        sections: [
          {
            type: "song",
            hits: [
              {
                result: {
                  id: 42,
                  url: "https://genius.com/coldplay-yellow-lyrics",
                  title: "Yellow",
                  primary_artist: { name: "Coldplay" },
                },
              },
            ],
          },
        ],
      },
    })
    expect(hits).toHaveLength(1)
    expect(hits[0]?.title).toBe("Yellow")
  })
})

describe("azlyrics parser", () => {
  it("extracts lyrics and strips ringtone footer", () => {
    const html = loadFixture("azlyrics-lyrics.html")
    const lyrics = parseAzLyricsHtml(html)
    expect(lyrics).toContain("Look at the stars")
    expect(lyrics).not.toContain("prohibited")
  })
})

describe("lyrics.com parser", () => {
  it("extracts lyric-body-text", () => {
    const html = loadFixture("lyricscom-lyrics.html")
    const lyrics = parseLyricsComLyricsHtml(html)
    expect(lyrics).toContain("shine for you")
  })
})

describe("musixmatch parser", () => {
  it("extracts search snippets", () => {
    const html = loadFixture("musixmatch-search.html")
    const snippets = parseMusixmatchSnippets(html)
    expect(snippets[0]?.snippet).toContain("shine")
    expect(snippets[0]?.url).toContain("musixmatch.com")
  })
})

describe("anime lyric parsers", () => {
  it("parses animelyrics table cells", () => {
    const html = loadFixture("animelyrics-lyrics.html")
    const lyrics = parseAnimelyricsHtml(html)
    expect(lyrics).toContain("Look at the stars")
  })

  it("parses lyrical-nonsense lyric body", () => {
    const html = loadFixture("lyrical-nonsense-lyrics.html")
    const lyrics = parseLyricalNonsenseHtml(html)
    expect(lyrics).toContain("星を見上げて")
  })
})
