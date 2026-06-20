import { describe, expect, it } from "vite-plus/test"
import { createHttpContractTarget } from "./contract-target"

const contractBaseUrl = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.CONTRACT_BASE_URL
const fixtureMode = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.RUST_GATEWAY_FIXTURE === "1"
const noAssetsMode = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.RUST_GATEWAY_NO_ASSETS === "1"
const describeGateway = contractBaseUrl && !noAssetsMode ? describe : describe.skip
const describeFixture =
  contractBaseUrl && fixtureMode && !noAssetsMode ? describe : describe.skip
const describeRustFailure =
  contractBaseUrl && noAssetsMode ? describe : describe.skip
const itRealLegacy = fixtureMode ? it.skip : it

describeGateway("Rust Worker gateway", () => {
  const target = createHttpContractTarget(contractBaseUrl ?? "http://127.0.0.1")

  it("serves the application through the Rust assets binding", async () => {
    const response = await target.request(new Request("https://song.example/"))

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("text/html")
    expect(response.headers.get("X-Umbra-Origin")).toBe("rust-assets")
    expect(response.headers.get("X-Umbra-Request-Id")).toBeTruthy()
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin")
    expect(await response.text()).toContain("<title>umbra")
  })

  it("preserves redirects and attributes them to Rust", async () => {
    const response = await target.request(
      new Request("https://song.example/watch?v=dQw4w9WgXcQ", {
        redirect: "manual",
      }),
    )

    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe(
      `${new URL(contractBaseUrl ?? "http://127.0.0.1").origin}/play/dQw4w9WgXcQ`,
    )
    expect(response.headers.get("X-Umbra-Origin")).toBe("rust")
  })

  itRealLegacy("attributes legacy validation responses and keeps one request ID", async () => {
    const requestId = "contract-request-id"
    const response = await target.request(
      new Request("https://song.example/api/youtube/oembed", {
        headers: { "X-Umbra-Request-Id": requestId },
      }),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get("X-Umbra-Origin")).toBe("legacy")
    expect(response.headers.get("X-Umbra-Request-Id")).toBe(requestId)
  })

  it("streams the versioned Rust lyrics resolution contract before completion", async () => {
    const response = await target.request(
      new Request("https://song.example/api/lyrics/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Umbra-Request-Id": "resolution-contract-request",
        },
        body: JSON.stringify({
          videoId: "dQw4w9WgXcQ",
          title: "Never Gonna Give You Up",
          author: "Rick Astley",
          duration: 212.4,
          language: "en",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("text/event-stream")
    expect(response.headers.get("X-Umbra-Origin")).toBe("rust")
    expect(response.headers.get("X-Umbra-Request-Id")).toBe("resolution-contract-request")

    const reader = response.body?.getReader()
    const first = await reader?.read()
    const firstText = new TextDecoder().decode(first?.value)
    expect(firstText).toContain("event: phase")
    expect(firstText).toContain('"protocolVersion":"1"')
    expect(firstText).not.toContain("event: result")

    let remaining = ""
    while (true) {
      const chunk = await reader?.read()
      if (!chunk || chunk.done) break
      remaining += new TextDecoder().decode(chunk.value)
    }
    expect(remaining).toContain("event: metadata")
    expect(remaining).toContain("event: result")
    expect(remaining).toContain('"resolution":"native"')
    expect(remaining).toContain('"english":')
    expect(remaining).toContain('"romaji":')
  })

  it("returns invalid input as a typed terminal SSE error", async () => {
    const response = await target.request(
      new Request("https://song.example/api/lyrics/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: "short" }),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain("event: error")
    expect(body).toContain('"code":"invalid_request"')
    expect(body).toContain('"field":"videoId"')
  })

  it("distinguishes malformed JSON from a valid JSON schema error", async () => {
    const malformed = await target.request(
      new Request("https://song.example/api/lyrics/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    )
    expect(await malformed.text()).toContain('"code":"invalid_json"')

    const wrongSchema = await target.request(
      new Request("https://song.example/api/lyrics/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: "dQw4w9WgXcQ", unknown: true }),
      }),
    )
    expect(await wrongSchema.text()).toContain('"code":"invalid_request"')
  })

  it("allows clients to cancel the pending resolution stream", async () => {
    const response = await target.request(
      new Request("https://song.example/api/lyrics/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: "dQw4w9WgXcQ" }),
      }),
    )
    const reader = response.body?.getReader()
    expect((await reader?.read())?.done).toBe(false)
    await expect(reader?.cancel("contract disconnect")).resolves.toBeUndefined()
  })
})

describeRustFailure("Rust Worker failure attribution", () => {
  const target = createHttpContractTarget(contractBaseUrl ?? "http://127.0.0.1")

  it("returns a typed Rust-origin error when the assets binding is unavailable", async () => {
    const response = await target.request(new Request("https://song.example/"))

    expect(response.status).toBe(502)
    expect(response.headers.get("X-Umbra-Origin")).toBe("rust")
    await expect(response.json()).resolves.toMatchObject({
      error: "rust_gateway_error",
      origin: "rust",
      stage: "assets_binding",
    })
  })
})

describeFixture("Rust Worker streaming transport", () => {
  const target = createHttpContractTarget(contractBaseUrl ?? "http://127.0.0.1")

  it("forwards authorization and correlation headers", async () => {
    const response = await target.request(
      new Request("https://song.example/api/test/echo", {
        headers: {
          Authorization: "Bearer contract-token",
          "X-Umbra-Request-Id": "transport-request-id",
        },
      }),
    )

    await expect(response.json()).resolves.toEqual({
      authorization: "Bearer contract-token",
      gateway: "rust",
      requestId: "transport-request-id",
    })
    expect(response.headers.get("X-Umbra-Origin")).toBe("legacy")
  })

  it("forwards range requests and partial response metadata", async () => {
    const response = await target.request(
      new Request("https://song.example/api/test/range", {
        headers: { Range: "bytes=10-19" },
      }),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get("X-Received-Range")).toBe("bytes=10-19")
    expect(response.headers.get("Content-Range")).toBe("bytes 10-12/100")
    expect(response.headers.get("Accept-Ranges")).toBe("bytes")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    )
  })

  it("returns the first streamed chunk without consuming the body", async () => {
    const startedAt = performance.now()
    const response = await target.request(
      new Request("https://song.example/api/test/stream"),
    )
    const reader = response.body?.getReader()
    const first = await reader?.read()

    expect(new TextDecoder().decode(first?.value)).toBe("first")
    expect(performance.now() - startedAt).toBeLessThan(125)
    const second = await reader?.read()
    expect(new TextDecoder().decode(second?.value)).toBe("second")
  })

  it("distinguishes legacy responses from Rust gateway failures", async () => {
    const legacyFailure = await target.request(
      new Request("https://song.example/api/test/failure"),
    )
    expect(legacyFailure.status).toBe(503)
    expect(legacyFailure.headers.get("X-Umbra-Origin")).toBe("legacy")

    const rustFailure = await target.request(
      new Request("https://song.example/api/test/throw"),
    )
    expect(rustFailure.status).toBe(500)
    expect(rustFailure.headers.get("X-Umbra-Origin")).toBe("legacy")
  })
})
