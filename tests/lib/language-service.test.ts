import { describe, expect, it } from "vitest"
import {
  inferPreferredLanguage,
  lyricsLanguageMatchesMetadata,
} from "@/lib/language-service"

describe("language-service metadata inference", () => {
  it("infers Japanese from CJK metadata", () => {
    expect(
      inferPreferredLanguage({
        title: "【Original Anime MV】別世界 - 天音かなた【ホロライブ】",
        artist: "天音かなた",
        track: "別世界",
      }),
    ).toBe("ja")
  })

  it("rejects English lyrics for Japanese metadata", () => {
    const english = "Swim, swim\nWater falling off your skin"
    expect(
      lyricsLanguageMatchesMetadata(english, {
        artist: "天音かなた",
        track: "別世界",
      }),
    ).toBe(false)
  })

  it("accepts Japanese lyrics for Japanese metadata", () => {
    const japanese = "作詞の空白を埋めるみたいに\n遠い遠い別世界まで"
    expect(
      lyricsLanguageMatchesMetadata(japanese, {
        artist: "天音かなた",
        track: "別世界",
      }),
    ).toBe(true)
  })
})
