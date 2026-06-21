import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  buildRomajiLines,
  buildRomajiLinesLocal,
  romanizeJapaneseLine,
} from "@/lib/romaji-service"

describe("romaji-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("romanizes hiragana and katakana lines locally", () => {
    expect(romanizeJapaneseLine("ひかりのセカイへ")).toBe("hikari no sekai e")
  })

  it("romanizes known kanji readings while romanizing available kana", () => {
    expect(romanizeJapaneseLine("遠いせかいへ")).toBe("tooi sekai e")
  })

  it("romanizes common kanji lyric phrases from readings", () => {
    expect(romanizeJapaneseLine("あなたに見られたなら")).toBe("anata ni mirarareta nara")
    expect(romanizeJapaneseLine("隠していたこの気持ちも")).toBe("kakushiteita kono kimochi mo")
    expect(romanizeJapaneseLine("届いてしまいそうで")).toBe("todoite shimaisou de")
  })

  it("builds aligned romaji lines for Japanese lyrics locally", () => {
    const lines = buildRomajiLinesLocal(["ひかりのセカイへ", "Hello world"], {
      language: "ja",
    })

    expect(lines.status).toBe("ready")
    expect(lines.lines).toEqual(["hikari no sekai e", "Hello world"])
  })

  it("skips non-Japanese lyrics", async () => {
    const lines = await buildRomajiLines(["Hello world"], { language: "en" })

    expect(lines.status).toBe("skipped")
    expect(lines.lines).toEqual([])
  })

  it("uses remote romaji when the API succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          lines: ["kyou wa otona no tanabatamatsuri desu"],
          system: "hepburn",
        }),
      ),
    )

    const lines = await buildRomajiLines(["今日は大人の七夕祭りです"], { language: "ja" })
    expect(lines.status).toBe("ready")
    expect(lines.lines).toEqual(["kyou wa otona no tanabatamatsuri desu"])
  })

  it("falls back to local romanization when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 503 })))

    const lines = await buildRomajiLines(["ひかりのセカイへ"], { language: "ja" })
    expect(lines.status).toBe("ready")
    expect(lines.lines).toEqual(["hikari no sekai e"])
  })
})
