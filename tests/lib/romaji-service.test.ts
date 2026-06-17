import { describe, expect, it } from "vitest"
import { buildRomajiLines, romanizeJapaneseLine } from "@/lib/romaji-service"

describe("romaji-service", () => {
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

  it("builds aligned romaji lines for Japanese lyrics", () => {
    const lines = buildRomajiLines(["ひかりのセカイへ", "Hello world"], {
      language: "ja",
    })

    expect(lines.status).toBe("ready")
    expect(lines.lines).toEqual(["hikari no sekai e", "Hello world"])
  })

  it("skips non-Japanese lyrics", () => {
    const lines = buildRomajiLines(["Hello world"], { language: "en" })

    expect(lines.status).toBe("skipped")
    expect(lines.lines).toEqual([])
  })
})
