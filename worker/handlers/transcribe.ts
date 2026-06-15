import { jsonResponse } from "../cors"
import { isAllowedStreamUrl, isValidVideoId, resolveYouTubeStream } from "./youtube-stream"

/** Max audio bytes fetched server-side (~4–5 min typical m4a). */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024

/** Target chunk duration when splitting long audio for multiple Whisper calls. */
export const CHUNK_DURATION_SEC = 60

export type TranscriptSegment = {
  start: number
  end: number
  text: string
}

export type TranscribeResult = {
  text: string
  segments: TranscriptSegment[]
  language?: string
  source: "whisper"
  partial?: boolean
}

type WhisperSegment = {
  start?: number
  end?: number
  text?: string
}

type WhisperResponse = {
  text?: string
  segments?: WhisperSegment[]
  transcription_info?: { language?: string }
}

export type TranscribeEnv = {
  AI?: {
    run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>
  }
}

export type TranscribeRequest = {
  videoId: string
  artist?: string
  track?: string
  language?: string
  durationSec?: number
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function normalizeSegments(raw: WhisperSegment[] | undefined): TranscriptSegment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((seg) => ({
      start: typeof seg.start === "number" ? seg.start : 0,
      end: typeof seg.end === "number" ? seg.end : typeof seg.start === "number" ? seg.start : 0,
      text: (seg.text ?? "").trim(),
    }))
    .filter((seg) => seg.text.length > 0)
}

/** Merge chunk transcripts by offsetting segment times. */
export function mergeTranscriptSegments(
  chunks: TranscriptSegment[][],
  chunkDurationSec: number,
): TranscriptSegment[] {
  const merged: TranscriptSegment[] = []
  for (let i = 0; i < chunks.length; i++) {
    const offset = i * chunkDurationSec
    for (const seg of chunks[i]) {
      merged.push({
        start: seg.start + offset,
        end: seg.end + offset,
        text: seg.text,
      })
    }
  }
  return merged
}

export async function fetchAudioBytes(
  streamUrl: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; partial: boolean }> {
  const headers = new Headers({
    Accept: "*/*",
    "User-Agent":
      "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)",
  })
  headers.set("Range", `bytes=0-${maxBytes - 1}`)

  const res = await fetch(streamUrl, {
    headers,
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok && res.status !== 206) {
    throw new Error(`Audio fetch failed (${res.status})`)
  }

  const buf = new Uint8Array(await res.arrayBuffer())
  const contentLength = Number(res.headers.get("Content-Length"))
  const totalSize = Number(res.headers.get("Content-Range")?.split("/")[1]) || contentLength
  const partial = totalSize > maxBytes || buf.byteLength >= maxBytes
  return { bytes: buf, partial }
}

export async function runWhisper(
  ai: NonNullable<TranscribeEnv["AI"]>,
  audioBase64: string,
  options: { language?: string; initialPrompt?: string },
): Promise<WhisperResponse> {
  const input: Record<string, unknown> = {
    audio: audioBase64,
    vad_filter: true,
  }
  if (options.language?.trim()) input.language = options.language.trim()
  if (options.initialPrompt?.trim()) input.initial_prompt = options.initialPrompt.trim()

  const result = await ai.run("@cf/openai/whisper-large-v3-turbo", input)
  return (result ?? {}) as WhisperResponse
}

export async function transcribeAudioBuffer(
  ai: NonNullable<TranscribeEnv["AI"]>,
  bytes: Uint8Array,
  options: { language?: string; artist?: string; track?: string },
): Promise<TranscribeResult> {
  const initialPrompt = [options.artist, options.track].filter(Boolean).join(" ").trim()
  const whisper = await runWhisper(ai, bytesToBase64(bytes), {
    language: options.language,
    initialPrompt: initialPrompt || undefined,
  })

  const segments = normalizeSegments(whisper.segments)
  const text = (whisper.text ?? segments.map((s) => s.text).join(" ")).trim()

  return {
    text,
    segments,
    language: whisper.transcription_info?.language,
    source: "whisper",
  }
}

export async function transcribeYouTubeAudio(
  env: TranscribeEnv,
  request: TranscribeRequest,
): Promise<TranscribeResult> {
  if (!env.AI) {
    throw new Error("Workers AI binding not configured")
  }

  const videoId = request.videoId.trim()
  const resolved = await resolveYouTubeStream(videoId, "audio")
  if (!resolved) {
    throw new Error("STREAM_UNAVAILABLE")
  }
  if (!isAllowedStreamUrl(resolved.url)) {
    throw new Error("STREAM_UNAVAILABLE")
  }

  const { bytes, partial: fetchPartial } = await fetchAudioBytes(resolved.url, MAX_AUDIO_BYTES)
  if (bytes.byteLength === 0) {
    throw new Error("EMPTY_AUDIO")
  }

  const result = await transcribeAudioBuffer(env.AI, bytes, {
    language: request.language,
    artist: request.artist,
    track: request.track,
  })

  if (result.segments.length === 0 && !result.text) {
    throw new Error("EMPTY_TRANSCRIPT")
  }

  const lastSegmentEndSec = result.segments.reduce((max, seg) => Math.max(max, seg.end), 0)
  const coveragePartial =
    typeof request.durationSec === "number" &&
    request.durationSec > 30 &&
    lastSegmentEndSec < request.durationSec - 30

  return {
    ...result,
    partial: fetchPartial || coveragePartial || undefined,
  }
}

export async function handleTranscribe(
  request: Request,
  env: TranscribeEnv,
): Promise<Response> {
  let body: TranscribeRequest
  try {
    body = (await request.json()) as TranscribeRequest
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const videoId = body.videoId?.trim() ?? ""
  if (!isValidVideoId(videoId)) {
    return jsonResponse({ error: "Invalid videoId" }, 400)
  }

  if (!env.AI) {
    return jsonResponse({ error: "Transcription not available — Workers AI not configured" }, 503)
  }

  try {
    const result = await transcribeYouTubeAudio(env, { ...body, videoId })
    return jsonResponse(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed"
    if (message === "STREAM_UNAVAILABLE") {
      return jsonResponse({ error: "YouTube audio stream unavailable" }, 502)
    }
    if (message === "EMPTY_AUDIO") {
      return jsonResponse({ error: "Could not download audio" }, 502)
    }
    if (message === "EMPTY_TRANSCRIPT") {
      return jsonResponse({ error: "No speech detected in audio" }, 422)
    }
    if (message.includes("timeout") || message.includes("Timeout")) {
      return jsonResponse({ error: "Transcription timed out — try again" }, 504)
    }
    return jsonResponse({ error: message }, 500)
  }
}
