import { describe, expect, it } from "vitest"
import {
  detectLanguage,
  inferPreferredLanguage,
  looksLikeEnglishLyrics,
  lyricsLanguageMatchesMetadata,
  needsEnglishLyrics,
  resolveTranslationSourceLang,
} from "@/lib/language-service"

const jpMeta = {
  title: "【Original Anime MV】別世界 - 天音かなた【ホロライブ】",
  artist: "天音かなた",
  track: "別世界",
}

describe("language-service metadata inference", () => {
  it("infers Japanese from CJK metadata", () => {
    expect(inferPreferredLanguage(jpMeta)).toBe("ja")
  })

  it("rejects English lyrics for Japanese metadata", () => {
    const english = "Swim, swim\nWater falling off your skin"
    expect(lyricsLanguageMatchesMetadata(english, jpMeta)).toBe(false)
  })

  it("accepts Japanese lyrics for Japanese metadata", () => {
    const japanese = "作詞の空白を埋めるみたいに\n遠い遠い別世界まで"
    expect(lyricsLanguageMatchesMetadata(japanese, jpMeta)).toBe(true)
  })
})

describe("detectLanguage", () => {
  it("detects Japanese script without relying on franc", () => {
    expect(detectLanguage("作詞の空白を埋めるみたいに", jpMeta)).toBe("ja")
  })

  it("does not treat short undetermined CJK as English", () => {
    expect(detectLanguage("別の世界へ", jpMeta)).toBe("ja")
  })

  it("uses metadata for romaji instead of noisy franc", () => {
    expect(detectLanguage("betsu no sekai e", jpMeta)).toBe("ja")
  })
})

describe("needsEnglishLyrics", () => {
  it("requires English for Japanese lyrics", () => {
    expect(needsEnglishLyrics("作詞の空白を埋めるみたいに", jpMeta)).toBe(true)
  })

  it("skips English for clearly English lyrics", () => {
    expect(needsEnglishLyrics("Hello from the other side", { artist: "Adele", track: "Hello" })).toBe(
      false,
    )
  })
})

describe("looksLikeEnglishLyrics", () => {
  it("rejects CJK text", () => {
    expect(looksLikeEnglishLyrics("別の世界へ")).toBe(false)
  })

  it("accepts Latin English text", () => {
    expect(looksLikeEnglishLyrics("Swim, swim\nWater falling off your skin")).toBe(true)
  })
})

describe("resolveTranslationSourceLang", () => {
  it("prefers Japanese metadata over romaji franc noise", () => {
    expect(resolveTranslationSourceLang("betsu no sekai e", jpMeta)).toBe("ja")
  })
})
