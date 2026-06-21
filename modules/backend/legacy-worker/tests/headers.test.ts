import { describe, expect, it } from "vitest"
import {
  httpsRedirect,
  isolationHeadersForUserAgent,
  karaokeWatchRedirect,
  withSecurityHeaders,
} from "../src/headers"

describe("worker security headers", () => {
  it("redirects http requests to https", () => {
    const request = new Request("http://song.opsec.rent/player")
    const response = httpsRedirect(request)

    expect(response?.status).toBe(301)
    expect(response?.headers.get("Location")).toBe("https://song.opsec.rent/player")
  })

  it("does not redirect http api requests", () => {
    const request = new Request("http://song.opsec.rent/api/youtube/playlist?id=PLabc")
    expect(httpsRedirect(request)).toBeNull()
  })

  it("adds HSTS to responses", () => {
    const response = withSecurityHeaders(new Response("ok", { status: 200 }))
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    )
  })

  it("adds cross-origin isolation headers when requested", () => {
    const response = withSecurityHeaders(new Response("ok", { status: 200 }), true)
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin")
    expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBe("credentialless")
  })

  it("omits isolation headers for Firefox so YouTube embeds can load", () => {
    const firefox =
      "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0"
    const response = withSecurityHeaders(new Response("ok", { status: 200 }), true, firefox)
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBeNull()
    expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBeNull()
  })

  it("keeps isolation headers for Chromium browsers", () => {
    const chrome =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    expect(isolationHeadersForUserAgent(chrome)).toEqual({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    })
  })
})

describe("karaokeWatchRedirect", () => {
  it("redirects /watch?v=ID to /play/ID", () => {
    const request = new Request("https://song.opsec.rent/watch?v=H58vbez_m4E")
    const response = karaokeWatchRedirect(request)

    expect(response?.status).toBe(301)
    expect(response?.headers.get("Location")).toBe("https://song.opsec.rent/play/H58vbez_m4E")
  })

  it("ignores /watch without a valid v param", () => {
    const request = new Request("https://song.opsec.rent/watch")
    expect(karaokeWatchRedirect(request)).toBeNull()

    const badId = new Request("https://song.opsec.rent/watch?v=short")
    expect(karaokeWatchRedirect(badId)).toBeNull()
  })

  it("ignores non-watch paths", () => {
    const request = new Request("https://song.opsec.rent/play/H58vbez_m4E")
    expect(karaokeWatchRedirect(request)).toBeNull()
  })
})
