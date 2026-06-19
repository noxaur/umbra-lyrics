import { describe, expect, it, vi, beforeEach } from "vitest"
import { handleRomaji } from "../../worker/handlers/romaji"

describe("romaji worker handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 503 when romaji service URL is not configured", async () => {
    const res = await handleRomaji({ lines: ["こんにちは"] })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("upstream_unconfigured")
  })

  it("proxies lines to the romaji service", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        expect(url).toBe("https://romaji.example/romaji")
        const payload = JSON.parse(String(init?.body)) as { lines: string[]; system: string }
        expect(payload.lines).toEqual(["別の世界へ"])
        expect(payload.system).toBe("hepburn")
        return Response.json({ lines: ["betsu no sekai e"], system: "hepburn" })
      }),
    )

    const res = await handleRomaji(
      { lines: ["別の世界へ"], system: "hepburn" },
      { ROMAJI_SERVICE_URL: "https://romaji.example" },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { lines: string[] }
    expect(body.lines).toEqual(["betsu no sekai e"])
  })

  it("forwards API key authorization to the romaji service", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const headers = init?.headers as Record<string, string>
        expect(headers.Authorization).toBe("Bearer secret-key")
        return Response.json({ lines: ["hikari no sekai e"], system: "hepburn" })
      }),
    )

    const res = await handleRomaji(
      { lines: ["ひかりのセカイへ"] },
      {
        ROMAJI_SERVICE_URL: "https://romaji.example",
        ROMAJI_SERVICE_API_KEY: "secret-key",
      },
    )
    expect(res.status).toBe(200)
  })
})
