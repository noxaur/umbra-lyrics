import { describe, expect, it } from "vitest"
import { httpsRedirect, withSecurityHeaders } from "../../worker/headers"

describe("worker security headers", () => {
  it("redirects http requests to https", () => {
    const request = new Request("http://song.opsec.rent/player")
    const response = httpsRedirect(request)

    expect(response?.status).toBe(301)
    expect(response?.headers.get("Location")).toBe("https://song.opsec.rent/player")
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
})
