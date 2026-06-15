import { describe, expect, it } from "vitest"
import { detectLanguage, francToBcp47, isEnglish, toLangPair } from "@/lib/language-service"

describe("language-service", () => {
  it("maps franc ISO 639-3 codes to BCP-47", () => {
    expect(francToBcp47("jpn")).toBe("ja")
    expect(francToBcp47("eng")).toBe("en")
    expect(francToBcp47("kor")).toBe("ko")
    expect(francToBcp47("und")).toBe("en")
  })

  it("detectLanguage returns BCP-47", () => {
    expect(detectLanguage("Hello world this is English text for detection")).toBe("en")
    expect(detectLanguage("作詞の空白を埋めるみたいに")).toBe("ja")
  })

  it("isEnglish accepts en and legacy eng", () => {
    expect(isEnglish("en")).toBe(true)
    expect(isEnglish("eng")).toBe(true)
    expect(isEnglish("ja")).toBe(false)
  })

  it("toLangPair builds MyMemory langpair", () => {
    expect(toLangPair("ja")).toBe("ja|en")
    expect(toLangPair("jpn")).toBe("ja|en")
  })
})
