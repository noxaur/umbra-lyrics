import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { createLegacyContractTarget } from "./contract-target"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("legacy Worker shell contracts", () => {
  it("adds security and isolation headers to static assets", async () => {
    const assetsFetch = vi.fn(async () => new Response("<html>umbra</html>"))
    const target = createLegacyContractTarget({
      ASSETS: { fetch: assetsFetch },
    })

    const response = await target.request(new Request("https://song.example/play/dQw4w9WgXcQ"))

    expect(await response.text()).toBe("<html>umbra</html>")
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=")
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin")
    expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBe("credentialless")
  })

  it("redirects non-API HTTP and YouTube watch requests", async () => {
    const target = createLegacyContractTarget()

    const httpsResponse = await target.request(
      new Request("http://song.example/play/dQw4w9WgXcQ", { redirect: "manual" }),
    )
    expect(httpsResponse.status).toBe(301)
    expect(httpsResponse.headers.get("Location")).toBe(
      "https://song.example/play/dQw4w9WgXcQ",
    )
    expect(httpsResponse.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin")

    const watchResponse = await target.request(
      new Request("https://song.example/watch?v=dQw4w9WgXcQ", { redirect: "manual" }),
    )
    expect(watchResponse.status).toBe(301)
    expect(watchResponse.headers.get("Location")).toBe(
      "https://song.example/play/dQw4w9WgXcQ",
    )
  })

  it("does not redirect HTTP API requests", async () => {
    const target = createLegacyContractTarget()
    const response = await target.request(
      new Request("http://song.example/api/youtube/search"),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get("Location")).toBeNull()
  })

  it("falls through unknown API paths and method mismatches to assets", async () => {
    const assetsFetch = vi.fn(async () => new Response("asset fallback"))
    const target = createLegacyContractTarget({
      ASSETS: { fetch: assetsFetch },
    })

    const unknown = await target.request(
      new Request("https://song.example/api/not-a-route"),
    )
    const methodMismatch = await target.request(
      new Request("https://song.example/api/romaji"),
    )

    expect(await unknown.text()).toBe("asset fallback")
    expect(await methodMismatch.text()).toBe("asset fallback")
    expect(assetsFetch).toHaveBeenCalledTimes(2)
  })

  it("forwards authorization through public API handlers", async () => {
    const upstreamFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get("Authorization")).toBe("Bearer contract-token")
      return new Response(
        JSON.stringify({
          id: "listener",
          display_name: "Contract Listener",
          email: null,
          images: [],
        }),
        { headers: { "Content-Type": "application/json" } },
      )
    })
    vi.stubGlobal("fetch", upstreamFetch)
    const target = createLegacyContractTarget()

    const response = await target.request(
      new Request("https://song.example/api/auth/spotify/me", {
        headers: { Authorization: "Bearer contract-token" },
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: "listener",
      displayName: "Contract Listener",
    })
  })

  it("forwards range headers and preserves partial response metadata", async () => {
    const upstreamFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get("Range")).toBe("bytes=10-19")
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          "Content-Type": "audio/webm",
          "Content-Length": "3",
          "Content-Range": "bytes 10-12/100",
          "Accept-Ranges": "bytes",
        },
      })
    })
    vi.stubGlobal("fetch", upstreamFetch)
    const target = createLegacyContractTarget()
    const encoded = btoa("https://rr1.googlevideo.com/videoplayback?contract=1")

    const response = await target.request(
      new Request(
        `https://song.example/api/beta/youtube/proxy-url?u=${encodeURIComponent(encoded)}`,
        { headers: { Range: "bytes=10-19" } },
      ),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get("Content-Range")).toBe("bytes 10-12/100")
    expect(response.headers.get("Accept-Ranges")).toBe("bytes")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("returns streaming bodies without consuming them first", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("first"))
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { headers: { "Content-Type": "audio/webm" } })),
    )
    const target = createLegacyContractTarget()
    const encoded = btoa("https://rr1.googlevideo.com/videoplayback?contract=stream")

    const response = await target.request(
      new Request(
        `https://song.example/api/beta/youtube/proxy-url?u=${encodeURIComponent(encoded)}`,
      ),
    )
    const reader = response.body?.getReader()
    const first = await reader?.read()

    expect(new TextDecoder().decode(first?.value)).toBe("first")
    await reader?.cancel()
  })

  it("attributes uncaught legacy Worker failures", async () => {
    const target = createLegacyContractTarget({
      ASSETS: {
        fetch: async () => {
          throw new Error("asset fixture failed")
        },
      },
    })

    const response = await target.request(
      new Request("https://song.example/failing-asset", {
        headers: { "X-Umbra-Request-Id": "legacy-error-request" },
      }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "legacy_worker_error",
      origin: "legacy",
      requestId: "legacy-error-request",
    })
  })

  it("omits isolation headers for Firefox so YouTube embeds can load", async () => {
    const assetsFetch = vi.fn(async () => new Response("<html>umbra</html>"))
    const target = createLegacyContractTarget({
      ASSETS: { fetch: assetsFetch },
    })
    const firefox =
      "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0"

    const response = await target.request(
      new Request("https://song.example/play/dQw4w9WgXcQ", {
        headers: { "User-Agent": firefox },
      }),
    )

    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBeNull()
    expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBeNull()
  })
})
