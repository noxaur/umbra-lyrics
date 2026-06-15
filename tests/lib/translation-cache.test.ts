import { beforeEach, describe, expect, it } from "vitest"
import {
  canRequestTranslation,
  getTranslationCache,
  markTranslationRequested,
  resetTranslationRateLimitForTests,
  setTranslationCache,
} from "@/lib/translation-cache"

describe("translation-cache", () => {
  beforeEach(() => {
    localStorage.clear()
    resetTranslationRateLimitForTests()
  })

  it("stores and retrieves translations per videoId and language", () => {
    setTranslationCache({
      videoId: "abc123",
      sourceLang: "ja",
      targetLang: "en",
      lines: ["Hello", "World"],
      backend: "mymemory",
    })

    const cached = getTranslationCache("abc123", "ja", "en")
    expect(cached?.lines).toEqual(["Hello", "World"])
    expect(cached?.backend).toBe("mymemory")
  })

  it("rate limits rapid translation requests per video", () => {
    expect(canRequestTranslation("vid1")).toBe(true)
    markTranslationRequested("vid1")
    expect(canRequestTranslation("vid1")).toBe(false)
    expect(canRequestTranslation("vid2")).toBe(true)
  })
})
