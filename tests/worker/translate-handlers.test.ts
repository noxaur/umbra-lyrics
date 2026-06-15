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

  it("returns structured error when MyMemory upstream fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("blocked", { status: 403 })),
    )

    const res = await handleMyMemory("Hola", "es|en")
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; upstream: string; upstreamStatus: number }
    expect(body.upstream).toBe("mymemory")
    expect(body.upstreamStatus).toBe(403)
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

  it("proxies LibreTranslate POST body when API key is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const payload = JSON.parse(String(init?.body)) as { api_key?: string }
        expect(payload.api_key).toBe("test-key")
        return Response.json({ translatedText: "Good morning" })
      }),
    )

    const res = await handleLibreTranslate(
      { q: "Bonjour", source: "fr", target: "en" },
      { LIBRETRANSLATE_API_KEY: "test-key" },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { translatedText: string }
    expect(body.translatedText).toBe("Good morning")
  })

  it("returns 503 when LibreTranslate API key is missing", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const res = await handleLibreTranslate({ q: "Bonjour", source: "fr", target: "en" })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("upstream_auth")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
