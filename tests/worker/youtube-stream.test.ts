import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  decodeStreamReference,
  handleYouTubeProxyUrl,
  handleYouTubeStreamInfo,
  handleYouTubeStreamProxy,
  isAllowedStreamUrl,
  isValidVideoId,
} from "../../worker/handlers/youtube-stream"
import { handleApiRequest } from "../../worker/router"

vi.mock("../../worker/lib/youtube-innertube", () => ({
  resolveStreamViaInnertube: vi.fn(),
}))

import { resolveStreamViaInnertube } from "../../worker/lib/youtube-innertube"

const mockResolve = vi.mocked(resolveStreamViaInnertube)

describe("youtube stream beta handlers", () => {
  beforeEach(() => {
    mockResolve.mockReset()
  })

  it("validates video ids", () => {
    expect(isValidVideoId("dQw4w9WgXcQ")).toBe(true)
    expect(isValidVideoId("bad")).toBe(false)
  })

  it("allows googlevideo stream hosts only", () => {
    expect(isAllowedStreamUrl("https://rr3---sn-abc.googlevideo.com/videoplayback?x=1")).toBe(true)
    expect(isAllowedStreamUrl("https://evil.example/videoplayback")).toBe(false)
  })

  it("decodes proxy path and direct googlevideo stream references", () => {
    const target = "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1"
    const encoded = btoa(target)
    const proxyPath = `/api/beta/youtube/proxy-url?u=${encodeURIComponent(encoded)}`

    expect(decodeStreamReference(proxyPath)).toBe(target)
    expect(decodeStreamReference(target)).toBe(target)
    expect(decodeStreamReference("https://evil.example/x")).toBeNull()
    expect(decodeStreamReference("/api/beta/youtube/proxy-url?u=not-base64")).toBeNull()
  })

  it("returns stream info with proxy url", async () => {
    mockResolve.mockResolvedValue({
      url: "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    const res = await handleYouTubeStreamInfo(
      "dQw4w9WgXcQ",
      "audio",
      new URL("https://song.example/api/beta/youtube/stream"),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { streamUrl: string; mimeType: string; source: string }
    expect(body.mimeType).toBe("audio/mp4")
    expect(body.streamUrl).toContain("/api/beta/youtube/proxy-url")
    expect(body.source).toBe("innertube")
  })

  it("proxies range requests to upstream", async () => {
    mockResolve.mockResolvedValue({
      url: "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("audio-bytes", {
          status: 206,
          headers: {
            "Content-Type": "audio/mp4",
            "Content-Range": "bytes 0-99/1000",
          },
        }),
      ),
    )

    const req = new Request("https://song.example/api/beta/youtube/proxy?videoId=dQw4w9WgXcQ", {
      headers: { Range: "bytes=0-99" },
    })
    const res = await handleYouTubeStreamProxy("dQw4w9WgXcQ", "audio", req)
    expect(res.status).toBe(206)
    expect(await res.text()).toBe("audio-bytes")
  })

  it("proxies direct googlevideo urls", async () => {
    const target = btoa("https://rr3---sn-abc.googlevideo.com/videoplayback?x=1")
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("googlevideo.com")
        return new Response("bytes", { status: 200 })
      }),
    )

    const res = await handleYouTubeProxyUrl(target, new Request("https://song.example/proxy-url"))
    expect(res.status).toBe(200)
  })

  it("routes beta stream endpoints via router", async () => {
    mockResolve.mockResolvedValue({
      url: "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    const res = await handleApiRequest(
      new Request("https://song.example/api/beta/youtube/stream?videoId=dQw4w9WgXcQ"),
    )
    expect(res?.status).toBe(200)
  })
})
