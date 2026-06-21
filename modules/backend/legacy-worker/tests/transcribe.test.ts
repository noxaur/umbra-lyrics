import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  chunkTimeOffsetSec,
  fetchAudioBytes,
  handleTranscribe,
  MAX_AUDIO_BYTES,
  mergeTranscriptSegmentsWithOffsets,
  planByteChunks,
  transcribeAudioBuffer,
  transcribeChunkedStream,
  transcribeYouTubeAudio,
} from "../src/handlers/transcribe"
import { checkTranscribeRateLimit, clientIp, resetTranscribeRateLimits } from "../src/lib/transcribe-rate-limit"
import { handleApiRequest } from "../src/router"

vi.mock("../src/lib/youtube-innertube", () => ({
  resolveStreamViaInnertube: vi.fn(),
}))

import { resolveStreamViaInnertube } from "../src/lib/youtube-innertube"

const mockResolve = vi.mocked(resolveStreamViaInnertube)

describe("transcribe rate limit", () => {
  beforeEach(() => {
    resetTranscribeRateLimits()
  })

  it("allows requests under the hourly cap", () => {
    expect(checkTranscribeRateLimit("1.2.3.4").allowed).toBe(true)
    expect(checkTranscribeRateLimit("1.2.3.4").allowed).toBe(true)
  })

  it("blocks after the cap is exceeded", () => {
    for (let i = 0; i < 12; i++) {
      expect(checkTranscribeRateLimit("9.9.9.9").allowed).toBe(true)
    }
    const blocked = checkTranscribeRateLimit("9.9.9.9")
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it("reads CF-Connecting-IP", () => {
    const req = new Request("https://song.example/api/lyrics/transcribe", {
      headers: { "CF-Connecting-IP": "203.0.113.1" },
    })
    expect(clientIp(req)).toBe("203.0.113.1")
  })
})

describe("transcribe handler", () => {
  beforeEach(() => {
    mockResolve.mockReset()
    resetTranscribeRateLimits()
    vi.restoreAllMocks()
  })

  it("merges chunk segments with custom offsets", () => {
    const merged = mergeTranscriptSegmentsWithOffsets(
      [
        [{ start: 0, end: 1, text: "one" }],
        [{ start: 0.5, end: 2, text: "two" }],
      ],
      [0, 120],
    )
    expect(merged).toHaveLength(2)
    expect(merged[1].start).toBe(120.5)
    expect(merged[1].text).toBe("two")
  })

  it("plans byte chunks within caps", () => {
    const plans = planByteChunks(9 * 1024 * 1024, 10 * 1024 * 1024, 2 * 1024 * 1024, 5)
    expect(plans).toHaveLength(5)
    expect(plans[0]).toEqual({ byteStart: 0, byteEnd: 2 * 1024 * 1024 - 1 })
  })

  it("estimates chunk offsets from duration", () => {
    expect(chunkTimeOffsetSec(2 * 1024 * 1024, 8 * 1024 * 1024, 240, 1)).toBeCloseTo(60)
  })

  it("rejects invalid videoId", async () => {
    const req = new Request("https://song.example/api/lyrics/transcribe", {
      method: "POST",
      body: JSON.stringify({ videoId: "bad" }),
    })
    const res = await handleTranscribe(req, { AI: { run: vi.fn() } })
    expect(res.status).toBe(400)
  })

  it("returns 503 when AI binding missing", async () => {
    const req = new Request("https://song.example/api/lyrics/transcribe", {
      method: "POST",
      body: JSON.stringify({ videoId: "dQw4w9WgXcQ" }),
    })
    const res = await handleTranscribe(req, {})
    expect(res.status).toBe(503)
  })

  it("returns 429 when rate limited", async () => {
    for (let i = 0; i < 12; i++) {
      checkTranscribeRateLimit("rate-test-ip")
    }

    const req = new Request("https://song.example/api/lyrics/transcribe", {
      method: "POST",
      headers: { "CF-Connecting-IP": "rate-test-ip" },
      body: JSON.stringify({ videoId: "dQw4w9WgXcQ" }),
    })
    const res = await handleTranscribe(req, { AI: { run: vi.fn() } })
    expect(res.status).toBe(429)
  })

  it("transcribes via whisper and returns segments", async () => {
    mockResolve.mockResolvedValue({
      url: "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") {
          return new Response(null, { status: 200, headers: { "Content-Length": "4" } })
        }
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "Content-Length": "4" },
        })
      }),
    )

    const aiRun = vi.fn(async () => ({
      text: "hello world",
      segments: [{ start: 0, end: 1.2, text: "hello world" }],
      transcription_info: { language: "en" },
    }))

    const req = new Request("https://song.example/api/lyrics/transcribe", {
      method: "POST",
      body: JSON.stringify({
        videoId: "dQw4w9WgXcQ",
        artist: "Artist",
        track: "Track",
      }),
    })

    const res = await handleTranscribe(req, { AI: { run: aiRun } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { text: string; segments: { text: string }[]; source: string }
    expect(body.source).toBe("whisper")
    expect(body.text).toBe("hello world")
    expect(body.segments[0].text).toBe("hello world")
    expect(aiRun).toHaveBeenCalledWith(
      "@cf/openai/whisper-large-v3-turbo",
      expect.objectContaining({ vad_filter: true, initial_prompt: "Artist Track" }),
    )
  })

  it("routes POST /api/lyrics/transcribe in router", async () => {
    const req = new Request("https://song.example/api/lyrics/transcribe", {
      method: "POST",
      body: JSON.stringify({ videoId: "bad" }),
    })
    const res = await handleApiRequest(req, { AI: { run: vi.fn() } })
    expect(res?.status).toBe(400)
  })

  it("fetchAudioBytes marks partial when content exceeds cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: { "Content-Length": "5000000" },
          })
        }
        if (init?.headers && new Headers(init.headers).get("Range")) {
          return new Response(new Uint8Array(50), { status: 206 })
        }
        return new Response(new Uint8Array(50), { status: 200 })
      }),
    )

    const { partial } = await fetchAudioBytes("https://rr3---sn-abc.googlevideo.com/x", 50)
    expect(partial).toBe(true)
  })

  it("transcribeAudioBuffer normalizes whisper output", async () => {
    const ai = {
      run: vi.fn(async () => ({
        text: "line one",
        segments: [{ start: 0, end: 2, text: "line one" }],
      })),
    }

    const result = await transcribeAudioBuffer(ai, new Uint8Array([1, 2, 3]), {
      artist: "A",
      track: "B",
    })

    expect(result.segments).toHaveLength(1)
    expect(result.text).toBe("line one")
  })

  it("parses vtt fallback when whisper segments are empty", async () => {
    const ai = {
      run: vi.fn(async () => ({
        text: "hello",
        segments: [],
        vtt: "WEBVTT\n\n00:00:00.000 --> 00:00:01.200\nhello\n",
      })),
    }

    const result = await transcribeAudioBuffer(ai, new Uint8Array([1, 2, 3]), {})
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].text).toBe("hello")
  })

  it("rejects disallowed stream URLs before fetch", async () => {
    mockResolve.mockResolvedValue({
      url: "https://evil.example/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    await expect(
      transcribeYouTubeAudio(
        { AI: { run: vi.fn() } },
        { videoId: "dQw4w9WgXcQ", durationSec: 200 },
      ),
    ).rejects.toThrow("STREAM_UNAVAILABLE")

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("transcribes using client-provided streamUrl when worker innertube fails", async () => {
    mockResolve.mockResolvedValue(null)

    const target = "https://rr3---sn-abc.googlevideo.com/videoplayback?client=1"
    const streamUrl = `/api/beta/youtube/proxy-url?u=${encodeURIComponent(btoa(target))}`

    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "Content-Length": "4" } })
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Length": "4" },
      })
    })
    vi.stubGlobal("fetch", fetchSpy)

    const aiRun = vi.fn(async () => ({
      text: "client stream",
      segments: [{ start: 0, end: 1, text: "client stream" }],
    }))

    const result = await transcribeYouTubeAudio(
      { AI: { run: aiRun } },
      { videoId: "H58vbez_m4E", streamUrl },
    )

    expect(result.text).toBe("client stream")
    expect(mockResolve).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalled()
  })

  it("prefers worker-resolved stream over client streamUrl", async () => {
    const workerUrl = "https://rr3---sn-worker.googlevideo.com/videoplayback?x=worker"
    const clientTarget = "https://rr3---sn-client.googlevideo.com/videoplayback?x=client"
    const streamUrl = `/api/beta/youtube/proxy-url?u=${encodeURIComponent(btoa(clientTarget))}`

    mockResolve.mockResolvedValue({
      url: workerUrl,
      mimeType: "audio/mp4",
      client: "IOS",
    })

    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "Content-Length": "4" } })
      }
      expect(url).toBe(workerUrl)
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Length": "4" },
      })
    })
    vi.stubGlobal("fetch", fetchSpy)

    const aiRun = vi.fn(async () => ({
      text: "worker stream",
      segments: [{ start: 0, end: 1, text: "worker stream" }],
    }))

    const result = await transcribeYouTubeAudio(
      { AI: { run: aiRun } },
      { videoId: "H58vbez_m4E", streamUrl },
    )

    expect(result.text).toBe("worker stream")
    expect(fetchSpy).toHaveBeenCalled()
  })

  it("rejects invalid client streamUrl", async () => {
    mockResolve.mockResolvedValue(null)

    await expect(
      transcribeYouTubeAudio(
        { AI: { run: vi.fn() } },
        { videoId: "dQw4w9WgXcQ", streamUrl: "https://evil.example/x" },
      ),
    ).rejects.toThrow("INVALID_STREAM_URL")
  })

  it("marks partial when transcript coverage is shorter than track duration", async () => {
    mockResolve.mockResolvedValue({
      url: "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") {
          return new Response(null, { status: 200, headers: { "Content-Length": "4" } })
        }
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "Content-Length": "4" },
        })
      }),
    )

    const ai = {
      run: vi.fn(async () => ({
        text: "short clip",
        segments: [{ start: 0, end: 45, text: "short clip" }],
      })),
    }

    const result = await transcribeYouTubeAudio(
      { AI: ai },
      { videoId: "dQw4w9WgXcQ", durationSec: 600 },
    )

    expect(result.partial).toBe(true)
  })

  it("uses single whisper call for large streams (no byte-range chunking)", async () => {
    mockResolve.mockResolvedValue({
      url: "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    const aiRun = vi.fn(async () => ({
      text: "full track",
      segments: [{ start: 0, end: 120, text: "full track" }],
    }))

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: { "Content-Length": String(5 * 1024 * 1024) },
          })
        }
        const headers = new Headers(init?.headers)
        if (headers.get("Range") === `bytes=0-${MAX_AUDIO_BYTES - 1}`) {
          return new Response(new Uint8Array(100), { status: 206 })
        }
        return new Response(new Uint8Array(100), { status: 200 })
      }),
    )

    const result = await transcribeYouTubeAudio(
      { AI: { run: aiRun } },
      { videoId: "dQw4w9WgXcQ", durationSec: 300 },
    )

    expect(result.text).toBe("full track")
    expect(result.partial).toBe(true)
    expect(result.chunks).toBe(1)
    expect(aiRun).toHaveBeenCalledTimes(1)
  })

  it("runs chunked transcription for large streams", async () => {
    const ai = {
      run: vi
        .fn()
        .mockResolvedValueOnce({
          text: "part one",
          segments: [{ start: 0, end: 2, text: "part one" }],
        })
        .mockResolvedValueOnce({
          text: "part two",
          segments: [{ start: 0, end: 2, text: "part two" }],
        }),
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        const range = headers.get("Range")
        if (range === "bytes=0-2097151") {
          return new Response(new Uint8Array(100), { status: 206 })
        }
        if (range === "bytes=2097152-4194303") {
          return new Response(new Uint8Array(100), { status: 206 })
        }
        return new Response(null, { status: 404 })
      }),
    )

    const result = await transcribeChunkedStream(ai, "https://rr3---sn-abc.googlevideo.com/x", {
      totalBytes: 4 * 1024 * 1024,
      durationSec: 240,
    })

    expect(result.chunks).toBe(2)
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
    expect(result.partial).toBe(true)
    expect(ai.run).toHaveBeenCalledTimes(2)
  })
})
