import { describe, expect, it, vi, beforeEach } from "vitest"
import { parseChartLyricsDirectXml } from "../../worker/handlers/chartlyrics"
import { parseVagalumeResponse } from "../../worker/handlers/vagalume"
import { parseGeniusLyricsHtml, parseGeniusSearch } from "../../worker/handlers/genius"
import {
  parseLyricsTranslatePage,
  parseLyricsTranslateSearch,
} from "../../worker/handlers/lyricstranslate"
import { parseAnimeLyricsPage, parseAnimeLyricsSearch } from "../../worker/handlers/animelyrics"
import {
  parseWikiLyricsWikitext,
  parseWikiSearch,
  splitWikiTitle,
} from "../../worker/handlers/lyricswiki"
import {
  parseSongMeaningsPage,
  parseSongMeaningsSearch,
} from "../../worker/handlers/songmeanings"
import {
  parsePetitLyricsLrc,
  parsePetitLyricsPage,
  parsePetitLyricsSearch,
} from "../../worker/handlers/petitlyrics"
import { parseLetrasPage, parseLetrasSearch } from "../../worker/handlers/letras"
import { handleChartLyricsSearch } from "../../worker/handlers/chartlyrics"
import { handleApiRequest } from "../../worker/router"

const CHART_XML = `<?xml version="1.0"?>
<GetLyricResult xmlns="http://api.chartlyrics.com/">
  <LyricId>42</LyricId>
  <LyricSong>Yellow</LyricSong>
  <LyricArtist>Coldplay</LyricArtist>
  <Lyric>Look at the stars</Lyric>
</GetLyricResult>`

describe("new lyrics provider parsers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("parses ChartLyrics direct XML", () => {
    const hit = parseChartLyricsDirectXml(CHART_XML)
    expect(hit?.id).toBe("42")
    expect(hit?.trackName).toBe("Yellow")
    expect(hit?.plainLyrics).toContain("stars")
  })

  it("parses Vagalume JSON response", () => {
    const hits = parseVagalumeResponse({
      mus: [{ id: "1", name: "Yellow", text: "Look at the stars", art: { name: "Coldplay" } }],
    })
    expect(hits[0]?.artistName).toBe("Coldplay")
    expect(hits[0]?.plainLyrics).toContain("stars")
  })

  it("parses Genius search JSON", () => {
    const hits = parseGeniusSearch({
      response: {
        sections: [
          {
            type: "song",
            hits: [
              {
                result: {
                  id: 99,
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
    expect(hits[0]?.trackName).toBe("Yellow")
    expect(hits[0]?.artistName).toBe("Coldplay")
  })

  it("parses Genius lyrics HTML container", () => {
    const html = `<div data-lyrics-container="true">Look at the<br/>stars</div>`
    expect(parseGeniusLyricsHtml(html)).toContain("stars")
  })

  it("parses LyricsTranslate search links", () => {
    const html = `<a href="/coldplay-yellow-lyrics.html" class="title">Yellow - Coldplay</a>`
    const links = parseLyricsTranslateSearch(html)
    expect(links[0]?.url).toContain("coldplay-yellow")
  })

  it("parses LyricsTranslate song page", () => {
    const html = `<h2 class="title">Yellow - Coldplay</h2><div id="song-body">Line one</div>`
    const parsed = parseLyricsTranslatePage(html)
    expect(parsed.plainLyrics).toContain("Line one")
    expect(parsed.trackName).toBe("Yellow")
  })

  it("extracts English stanzas from bilingual LyricsTranslate pages", () => {
    const html = `
      <h2 class="title">別世界 - 天音かなた</h2>
      <div id="song-body">
        <div class="par">別の世界へ</div>
        <div class="par">To another world</div>
        <div class="par">遠い空の彼方</div>
        <div class="par">Beyond the distant sky</div>
      </div>
    `
    const parsed = parseLyricsTranslatePage(html)
    expect(parsed.plainLyrics).toContain("To another world")
    expect(parsed.plainLyrics).toContain("Beyond the distant sky")
    expect(parsed.plainLyrics).not.toContain("別の世界へ")
  })

  it("parses AnimeLyrics search and page", () => {
    const searchHtml = `<a href="/anime/naruto/peace.htm">Peace</a>`
    expect(parseAnimeLyricsSearch(searchHtml)[0]?.title).toBe("Peace")

    const pageHtml = `<h1>Peace</h1><div class="padding">遥か彼方で</div>`
    const parsed = parseAnimeLyricsPage(pageHtml)
    expect(parsed.languageHint).toBe("ja")
    expect(parsed.plainLyrics).toContain("彼方")
  })

  it("parses Lyrics Wiki search and wikitext", () => {
    const search = parseWikiSearch({
      query: { search: [{ pageid: 7, title: "Coldplay:Yellow" }] },
    })
    expect(search[0]?.title).toBe("Coldplay:Yellow")

    const html = `<pre>Look at the stars</pre>`
    expect(parseWikiLyricsWikitext(html)).toContain("stars")

    const split = splitWikiTitle("Coldplay:Yellow")
    expect(split.artistName).toBe("Coldplay")
    expect(split.trackName).toBe("Yellow")
  })

  it("parses SongMeanings search and page", () => {
    const searchHtml = `<a href="/songs/view/123/">Yellow by Coldplay</a>`
    expect(parseSongMeaningsSearch(searchHtml)[0]?.title).toContain("Yellow")

    const pageHtml = `<h1>Yellow by Coldplay</h1><div class="song-body">Stars above</div>`
    const parsed = parseSongMeaningsPage(pageHtml)
    expect(parsed.plainLyrics).toContain("Stars")
    expect(parsed.artistName).toBe("Coldplay")
  })

  it("parses PetitLyrics LRC content", () => {
    const lrc = "[00:10.00] Hello world"
    expect(parsePetitLyricsLrc(lrc)).toBe(lrc)

    const pageHtml = `<h1>Artist / Song</h1><textarea id="lrc_text">[00:10.00] Hello</textarea>`
    const parsed = parsePetitLyricsPage(pageHtml)
    expect(parsed.syncedLyrics).toContain("[00:10.00]")

    const searchHtml = `<tr><a href="/lyrics/55">Song Title</a></tr>`
    expect(parsePetitLyricsSearch(searchHtml)[0]?.path).toBe("/lyrics/55")
  })

  it("parses Letras search and page", () => {
    const searchHtml = `<a href="/coldplay/yellow/">Yellow</a>`
    expect(parseLetrasSearch(searchHtml)[0]?.title).toBe("Yellow")

    const pageHtml = `<h1>Yellow</h1><h2>Coldplay</h2><div class="lyric-original">Mira las estrellas</div>`
    const parsed = parseLetrasPage(pageHtml)
    expect(parsed.plainLyrics).toContain("estrellas")
    expect(parsed.artistName).toBe("Coldplay")
  })

  it("proxies ChartLyrics search via router", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(CHART_XML, { status: 200 })),
    )

    const res = await handleChartLyricsSearch("Coldplay", "Yellow")
    const body = (await res.json()) as { results: Array<{ plainLyrics: string }> }
    expect(body.results[0]?.plainLyrics).toContain("stars")

    const routed = await handleApiRequest(
      new Request("http://localhost/api/lyrics/chartlyrics/search?artist=Coldplay&track=Yellow"),
    )
    expect(routed?.status).toBe(200)
  })
})
