import { lyricsApiBase } from "@/lib/lyrics-providers/api-base"
import type { TranscriptSegment } from "@/lib/transcript-to-lyrics"
import { resolveYouTubeStreamForApi } from "@/lib/youtube-stream-resolve"

export type TranscribeResponse = {
  text: string
  segments: TranscriptSegment[]
  language?: string
  source: "whisper"
  partial?: boolean
  chunks?: number
  retryAfterSec?: number
}

export type TranscribeOptions = {
  videoId: string
  artist?: string
  track?: string
  language?: string
  durationSec?: number
  signal?: AbortSignal
}

export class TranscriptionError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "TranscriptionError"
    this.status = status
  }
}

async function postTranscribe(
  options: TranscribeOptions,
  streamUrl?: string,
): Promise<Response> {
  const base = lyricsApiBase()
  return fetch(`${base}/api/lyrics/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId: options.videoId,
      artist: options.artist,
      track: options.track,
      language: options.language,
      durationSec: options.durationSec,
      ...(streamUrl ? { streamUrl } : {}),
    }),
    signal: options.signal,
  })
}

/** Retry with a browser-resolved stream when worker InnerTube fails (datacenter IP blocks). */
async function resolveClientStreamUrl(videoId: string): Promise<string | null> {
  if (typeof window === "undefined") return null
  try {
    const resolved = await resolveYouTubeStreamForApi(videoId, "audio")
    return resolved?.streamUrl ?? null
  } catch {
    return null
  }
}

export async function transcribeFromYouTube(options: TranscribeOptions): Promise<TranscribeResponse> {
  let res = await postTranscribe(options)

  if (res.status === 502) {
    const clientStreamUrl = await resolveClientStreamUrl(options.videoId)
    if (clientStreamUrl) {
      res = await postTranscribe(options, clientStreamUrl)
    }
  }

  const body = (await res.json().catch(() => ({}))) as TranscribeResponse & { error?: string }
  if (!res.ok) {
    throw new TranscriptionError(body.error ?? `Transcription failed (${res.status})`, res.status)
  }

  return body
}
