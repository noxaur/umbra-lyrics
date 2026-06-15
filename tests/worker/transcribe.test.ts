import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  fetchAudioBytes,
  handleTranscribe,
  mergeTranscriptSegments,
  transcribeAudioBuffer,
} from "../../worker/handlers/transcribe"
import { handleApiRequest } from "../../worker/router"

vi.mock("../../worker/lib/youtube-innertube", () => ({
  resolveStreamViaInnertube: vi.fn(),
}))

import { resolveStreamViaInnertube } from "../../worker/lib/youtube-innertube"

const mockResolve = vi.mocked(resolveStreamViaInnertube)

describe("transcribe handler", () => {
  beforeEach(() => {
    mockResolve.mockReset()
    vi.restoreAllMocks()
  })

  it("merges chunk segments with time offsets", () => {
    const merged = mergeTranscriptSegments(
      [
        [{ start: 0, end: 1, text: "one" }],
        [{ start: 0.5, end: 2, text: "two" }],
      ],
      60,
    )
    expect(merged).toHaveLength(2)
    expect(merged[1].start).toBe(60.5)
    expect(merged[1].text).toBe("two")
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

  it("transcribes via whisper and returns segments", async () => {
    mockResolve.mockResolvedValue({
      url: "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1",
      mimeType: "audio/mp4",
      client: "IOS",
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: { "Content-Range": "bytes 0-3/4" },
        }),
      ),
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
      vi.fn(async () =>
        new Response(new Uint8Array(100), {
          status: 206,
          headers: { "Content-Range": "bytes 0-99/5000000" },
        }),
      ),
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
})
