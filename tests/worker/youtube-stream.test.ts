import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  handleYouTubeStreamInfo,
  handleYouTubeStreamProxy,
  isValidVideoId,
} from "../../worker/handlers/youtube-stream"
import { handleApiRequest } from "../../worker/router"

describe("youtube stream beta handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("validates video ids", () => {
    expect(isValidVideoId("dQw4w9WgXcQ")).toBe(true)
    expect(isValidVideoId("bad")).toBe(false)
  })

  it("returns stream info with proxy url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          audioStreams: [{ url: "https://cdn.example/audio.m4a", mimeType: "audio/mp4" }],
          videoStreams: [],
        }),
      ),
    )

    const res = await handleYouTubeStreamInfo(
      "dQw4w9WgXcQ",
      "audio",
      new URL("https://song.example/api/beta/youtube/stream"),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { streamUrl: string; mimeType: string }
    expect(body.mimeType).toBe("audio/mp4")
    expect(body.streamUrl).toContain("/api/beta/youtube/proxy")
  })

  it("proxies range requests to upstream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/streams/")) {
          return Response.json({
            audioStreams: [{ url: "https://cdn.example/audio.m4a", mimeType: "audio/mp4" }],
          })
        }
        expect(init?.headers).toBeDefined()
        return new Response("audio-bytes", {
          status: 206,
          headers: {
            "Content-Type": "audio/mp4",
            "Content-Range": "bytes 0-99/1000",
          },
        })
      }),
    )

    const req = new Request("https://song.example/api/beta/youtube/proxy?videoId=dQw4w9WgXcQ", {
      headers: { Range: "bytes=0-99" },
    })
    const res = await handleYouTubeStreamProxy("dQw4w9WgXcQ", "audio", req)
    expect(res.status).toBe(206)
    expect(await res.text()).toBe("audio-bytes")
  })

  it("routes beta stream endpoints via router", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          audioStreams: [{ url: "https://cdn.example/audio.m4a", mimeType: "audio/mp4" }],
        }),
      ),
    )

    const res = await handleApiRequest(
      new Request("https://song.example/api/beta/youtube/stream?videoId=dQw4w9WgXcQ"),
    )
    expect(res?.status).toBe(200)
  })
})
