import { describe, expect, it, vi } from "vite-plus/test"
import {
  resolveLyricsWithRust,
  type RustLyricsEvent,
  type RustLyricsEventName,
} from "@/lib/rust-lyrics-resolver"

const timestamp = "2026-06-19T12:00:00.000Z"

function event(name: RustLyricsEventName, data: Record<string, unknown>): string {
  return `event: ${name}\ndata: ${JSON.stringify({
    protocolVersion: "1",
    requestId: "request-123",
    timestamp,
    data,
  })}\n\n`
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Umbra-Request-Id": "request-123",
      },
    },
  )
}

describe("resolveLyricsWithRust", () => {
  it("parses events across chunk boundaries and returns terminal result", async () => {
    const body =
      event("phase", { phase: "accepted", message: "Accepted" }) +
      event("result", {
        outcome: "found",
        resolution: "native",
        videoId: "dQw4w9WgXcQ",
        metadata: {
          title: "Never Gonna Give You Up",
          author: "Rick Astley",
          duration: 212.4,
          language: "en",
        },
        lyrics: {
          id: "42",
          providerId: "lrclib",
          artist: "Rick Astley",
          track: "Never Gonna Give You Up",
          duration: 212.4,
          plainLyrics: "We're no strangers to love",
          syncedLyrics: "[00:18.00] We're no strangers to love",
          synced: true,
          approximateTiming: false,
          lines: [
            {
              startMs: 18_000,
              endMs: 22_000,
              text: "We're no strangers to love",
              approximate: false,
              kind: "lyric",
            },
          ],
          score: 0,
          confidence: 100,
          scoringReasons: [{ code: "synced_lrc", points: -120 }],
        },
        alternates: [],
        message: "Found native lyrics",
      })
    const seen: RustLyricsEventName[] = []
    const fetchImpl = vi.fn(async () =>
      streamResponse([body.slice(0, 17), body.slice(17, 91), body.slice(91)]),
    )

    const result = await resolveLyricsWithRust(
      { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up" },
      {
        fetchImpl,
        onEvent: (streamEvent: RustLyricsEvent) => seen.push(streamEvent.event),
      },
    )

    expect(seen).toEqual(["phase"])
    expect(result).toMatchObject({
      outcome: "found",
      resolution: "native",
      videoId: "dQw4w9WgXcQ",
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/lyrics/resolve",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("rejects typed terminal errors", async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse([
        event("error", {
          code: "invalid_request",
          message: "bad video ID",
          field: "videoId",
          retryable: false,
        }),
      ]),
    )

    await expect(
      resolveLyricsWithRust({ videoId: "bad" }, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "invalid_request",
      field: "videoId",
      retryable: false,
    })
  })

  it("rejects streams without terminal result", async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse([event("phase", { phase: "accepted", message: "Accepted" })]),
    )

    await expect(
      resolveLyricsWithRust({ videoId: "dQw4w9WgXcQ" }, { fetchImpl }),
    ).rejects.toThrow("stream ended without a result")
  })

  it("rejects malformed records even if a later result is valid", async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse([
        "data: missing-event\n\n",
      event("result", {
        outcome: "not_found",
        resolution: "native",
        videoId: "dQw4w9WgXcQ",
        metadata: { title: null, author: null, duration: null, language: null },
        lyrics: null,
        alternates: [],
        message: "No native lyrics found",
      }),
      ]),
    )

    await expect(
      resolveLyricsWithRust({ videoId: "dQw4w9WgXcQ" }, { fetchImpl }),
    ).rejects.toThrow("malformed SSE record")
  })

  it("rejects event envelopes with mismatched request IDs or timestamps", async () => {
    const mismatched = event("phase", { phase: "accepted", message: "Accepted" }).replace(
      '"requestId":"request-123"',
      '"requestId":"other-request"',
    )
    const fetchImpl = vi.fn(async () => streamResponse([mismatched]))
    await expect(
      resolveLyricsWithRust({ videoId: "dQw4w9WgXcQ" }, { fetchImpl }),
    ).rejects.toThrow("request ID did not match")

    const badTimestamp = event("phase", { phase: "accepted", message: "Accepted" }).replace(
      timestamp,
      "not-a-timestamp",
    )
    const timestampFetch = vi.fn(async () => streamResponse([badTimestamp]))
    await expect(
      resolveLyricsWithRust({ videoId: "dQw4w9WgXcQ" }, { fetchImpl: timestampFetch }),
    ).rejects.toThrow("invalid event envelope")
  })

  it("parses standard CRLF-delimited SSE records", async () => {
    const body = (
      event("phase", { phase: "accepted", message: "Accepted" }) +
      event("result", {
        outcome: "not_found",
        resolution: "native",
        videoId: "dQw4w9WgXcQ",
        metadata: { title: null, author: null, duration: null, language: null },
        lyrics: null,
        alternates: [],
        message: "No native lyrics found",
      })
    ).replaceAll("\n", "\r\n")
    const fetchImpl = vi.fn(async () => streamResponse([body.slice(0, 23), body.slice(23)]))

    await expect(
      resolveLyricsWithRust({ videoId: "dQw4w9WgXcQ" }, { fetchImpl }),
    ).resolves.toMatchObject({ resolution: "native" })
  })

  it("passes abort signals to fetch", async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal)
      throw new DOMException("Aborted", "AbortError")
    })

    controller.abort()
    await expect(
      resolveLyricsWithRust(
        { videoId: "dQw4w9WgXcQ" },
        { fetchImpl, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
})
