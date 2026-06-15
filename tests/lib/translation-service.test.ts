import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  resetTranslationRateLimitForTests,
  setTranslationCache,
} from "@/lib/translation-cache"
import { translateLinesWithFallback } from "@/lib/translation-service"

describe("translateLinesWithFallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    resetTranslationRateLimitForTests()
    delete window.Translator
  })

  it("returns cached translation without calling APIs", async () => {
    setTranslationCache({
      videoId: "v1",
      sourceLang: "ja",
      targetLang: "en",
      lines: ["Line one", "Line two"],
      backend: "google",
    })

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const result = await translateLinesWithFallback(["一", "二"], {
      videoId: "v1",
      sourceLang: "ja",
    })

    expect(result?.fromCache).toBe(true)
    expect(result?.backend).toBe("google")
    expect(result?.lines).toEqual(["Line one", "Line two"])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falls through backends until one succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("libretranslate")) {
          return new Response(JSON.stringify({ error: "fail" }), { status: 502 })
        }
        if (String(url).includes("mymemory")) {
          return Response.json({ translatedText: "Hello\nWorld" })
        }
        return new Response("{}", { status: 404 })
      }),
    )

    const result = await translateLinesWithFallback(["こんにちは", "世界"], {
      videoId: "v2",
      sourceLang: "ja",
      backends: ["libretranslate", "mymemory"],
    })

    expect(result?.backend).toBe("mymemory")
    expect(result?.lines).toEqual(["Hello", "World"])
    expect(result?.fromCache).toBe(false)
  })

  it("skips translation for English source", async () => {
    const result = await translateLinesWithFallback(["Hello"], { sourceLang: "en" })
    expect(result).toBeNull()
  })
})
