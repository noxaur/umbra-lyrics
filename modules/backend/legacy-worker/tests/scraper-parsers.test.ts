import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { isAllowedUrl } from "../src/scraper/allowlist"
import { parseAzLyricsHtml, buildAzLyricsUrl } from "../src/scraper/extractors/azlyrics"
import {
  parseAnimelyricsHtml,
  parseLyricalNonsenseHtml,
} from "../src/scraper/extractors/anime"
import {
  parseGeniusLyricsFromPage,
  parseGeniusLyricsHtml,
  parseGeniusSearchJson,
} from "../src/scraper/extractors/genius"
import { parseLyricsComLyricsHtml } from "../src/scraper/extractors/lyricscom"
import { decodeHtml, slugifyAz } from "../src/scraper/html"
import { scoreHit } from "../src/scraper/rank"
import type { ScraperHit } from "../src/scraper/types"

const FIXTURES = join(import.meta.dirname, "../../../../tests/fixtures/scraper")

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
    expect(decodeHtml("It&#8217;s fine")).toBe("It\u2019s fine")
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

  it("does not fall back to og:description", () => {
    const html = `<meta property="og:description" content="Song description prose" />`
    expect(parseGeniusLyricsFromPage(html)).toBeNull()
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

describe("scraper rank", () => {
  it("penalizes very short plain lyrics", () => {
    const shortHit: ScraperHit = {
      source: "musixmatch",
      sourceId: "1",
      url: "https://example.com",
      trackName: "Yellow",
      artistName: "Coldplay",
      plainLyrics: "Look at the stars",
      syncedLyrics: null,
      confidence: 0,
    }
    const fullHit: ScraperHit = {
      ...shortHit,
      plainLyrics:
        "Look at the stars\nLook how they shine for you\nAnd everything you do\nAnd all the things you do\nYeah they were all yellow\nI came along\nI wrote a song for you",
    }
    const params = { artist: "Coldplay", track: "Yellow" }
    expect(scoreHit(shortHit, params, 5)).toBeGreaterThan(scoreHit(fullHit, params, 5))
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
