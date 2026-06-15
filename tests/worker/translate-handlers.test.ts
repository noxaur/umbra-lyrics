import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  handleGoogleTranslate,
  handleLibreTranslate,
  handleMyMemory,
} from "../../worker/handlers/translate"

describe("translate worker handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("proxies MyMemory translation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ responseData: { translatedText: "Hello" }, responseStatus: 200 }),
      ),
    )

    const res = await handleMyMemory("こんにちは", "ja|en")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { translatedText: string }
    expect(body.translatedText).toBe("Hello")
  })

  it("proxies Google translation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([[["Hello", "Hello", null, null, 1]]])),
    )

    const res = await handleGoogleTranslate("Hola", "es", "en")
    const body = (await res.json()) as { translatedText: string }
    expect(body.translatedText).toBe("Hello")
  })

  it("proxies LibreTranslate POST body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ translatedText: "Good morning" })),
    )

    const res = await handleLibreTranslate({ q: "Bonjour", source: "fr", target: "en" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { translatedText: string }
    expect(body.translatedText).toBe("Good morning")
  })
})
