import { lyricsApiBase } from "@/lib/lyrics-providers/api-base"
import type { TranscriptSegment } from "@/lib/transcript-to-lyrics"

export type TranscribeResponse = {
  text: string
  segments: TranscriptSegment[]
  language?: string
  source: "whisper"
  partial?: boolean
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

export async function transcribeFromYouTube(options: TranscribeOptions): Promise<TranscribeResponse> {
  const base = lyricsApiBase()
  const res = await fetch(`${base}/api/lyrics/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId: options.videoId,
      artist: options.artist,
      track: options.track,
      language: options.language,
      durationSec: options.durationSec,
    }),
    signal: options.signal,
  })

  const body = (await res.json().catch(() => ({}))) as TranscribeResponse & { error?: string }
  if (!res.ok) {
    throw new TranscriptionError(body.error ?? `Transcription failed (${res.status})`, res.status)
  }

  return body
}
