import { jsonResponse } from "../cors"
import { checkTranscribeRateLimit, clientIp } from "../lib/transcribe-rate-limit"
import { isAllowedStreamUrl, isValidVideoId, resolveYouTubeStream, decodeStreamReference } from "./youtube-stream"

/** Max audio bytes for sample/verification mode (~90s of typical bitrate). */
export const SAMPLE_MAX_AUDIO_BYTES = 2 * 1024 * 1024

/** Max total audio bytes fetched server-side across all chunks. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024

/** Bytes per Whisper call when chunking large streams. */
export const CHUNK_BYTE_SIZE = 2 * 1024 * 1024

/** Max Whisper calls per transcription request. */
export const MAX_TRANSCRIBE_CHUNKS = 5

/** Legacy export kept for tests — approximate seconds per byte chunk. */
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
  chunks?: number
  vocalDensity?: number
  coverageSec?: number
  mode?: "sample" | "full"
}

type WhisperWord = {
  word?: string
  start?: number
  end?: number
}

type WhisperSegment = {
  start?: number
  end?: number
  text?: string
  words?: WhisperWord[]
}

type WhisperResponse = {
  text?: string
  segments?: WhisperSegment[]
  vtt?: string
  transcription_info?: { language?: string }
}

export type TranscribeEnv = {
  AI?: {
    run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>
  }
}

export type TranscribeRequest = {
  videoId: string
  /** Client-resolved stream proxy path or googlevideo URL when worker InnerTube fails. */
  streamUrl?: string
  artist?: string
  track?: string
  language?: string
  durationSec?: number
  mode?: "sample" | "full"
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function unwrapWhisperResponse(raw: unknown): WhisperResponse {
  if (!raw || typeof raw !== "object") return {}
  const obj = raw as Record<string, unknown>
  if (obj.result && typeof obj.result === "object") {
    return obj.result as WhisperResponse
  }
  return obj as WhisperResponse
}

function parseVttSegments(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  const blocks = vtt.split(/\n\n+/).slice(1)
  for (const block of blocks) {
    const lines = block.trim().split("\n")
    if (lines.length < 2) continue
    const timing = lines.find((line) => line.includes("-->"))
    if (!timing) continue
    const [startRaw, endRaw] = timing.split("-->").map((s) => s.trim())
    const text = lines
      .filter((line) => !line.includes("-->") && !/^\d+$/.test(line.trim()))
      .join(" ")
      .trim()
    if (!text) continue
    segments.push({
      start: vttTimestampToSec(startRaw),
      end: vttTimestampToSec(endRaw),
      text,
    })
  }
  return segments
}

function vttTimestampToSec(raw: string): number {
  const parts = raw.trim().split(":")
  if (parts.length === 3) {
    const [h, m, s] = parts
    const [sec, ms] = s.split(".")
    return Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms || 0) / 1000
  }
  if (parts.length === 2) {
    const [m, s] = parts
    const [sec, ms] = s.split(".")
    return Number(m) * 60 + Number(sec) + Number(ms || 0) / 1000
  }
  return 0
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

function segmentsFromWhisper(raw: WhisperSegment[] | undefined, vtt?: string): TranscriptSegment[] {
  const fromSegments = normalizeSegments(raw)
  if (fromSegments.length > 0) return fromSegments
  if (vtt?.trim()) {
    const fromVtt = parseVttSegments(vtt)
    if (fromVtt.length > 0) return fromVtt
  }
  return []
}

/** Merge chunk transcripts by offsetting segment times (fixed window). */
export function mergeTranscriptSegments(
  chunks: TranscriptSegment[][],
  chunkDurationSec: number,
): TranscriptSegment[] {
  const offsets = chunks.map((_, i) => i * chunkDurationSec)
  return mergeTranscriptSegmentsWithOffsets(chunks, offsets)
}

/** Merge chunk transcripts using per-chunk start offsets in seconds. */
export function mergeTranscriptSegmentsWithOffsets(
  chunks: TranscriptSegment[][],
  offsetsSec: number[],
): TranscriptSegment[] {
  const merged: TranscriptSegment[] = []
  for (let i = 0; i < chunks.length; i++) {
    const offset = offsetsSec[i] ?? 0
    for (const seg of chunks[i]) {
      merged.push({
        start: seg.start + offset,
        end: seg.end + offset,
        text: seg.text,
      })
    }
  }
  return merged.sort((a, b) => a.start - b.start)
}

function streamHeaders(): Headers {
  return new Headers({
    Accept: "*/*",
    "User-Agent":
      "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)",
  })
}

export async function probeStreamSize(streamUrl: string): Promise<number | null> {
  const head = await fetch(streamUrl, {
    method: "HEAD",
    headers: streamHeaders(),
    signal: AbortSignal.timeout(30_000),
  })
  if (head.ok) {
    const len = Number(head.headers.get("Content-Length"))
    if (len > 0) return len
  }

  const ranged = await fetch(streamUrl, {
    headers: (() => {
      const h = streamHeaders()
      h.set("Range", "bytes=0-0")
      return h
    })(),
    signal: AbortSignal.timeout(30_000),
  })

  if (ranged.status === 206) {
    const total = Number(ranged.headers.get("Content-Range")?.split("/")[1])
    if (total > 0) return total
  }

  return null
}

export async function fetchAudioRange(
  streamUrl: string,
  byteStart: number,
  byteEnd: number,
): Promise<Uint8Array> {
  const headers = streamHeaders()
  headers.set("Range", `bytes=${byteStart}-${byteEnd}`)

  const res = await fetch(streamUrl, {
    headers,
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok && res.status !== 206) {
    throw new Error(`Audio fetch failed (${res.status})`)
  }

  return new Uint8Array(await res.arrayBuffer())
}

export async function fetchAudioBytes(
  streamUrl: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; partial: boolean; totalBytes: number | null }> {
  const totalBytes = await probeStreamSize(streamUrl)
  if (totalBytes != null && totalBytes > maxBytes) {
    const bytes = await fetchAudioRange(streamUrl, 0, maxBytes - 1)
    return { bytes, partial: true, totalBytes }
  }

  const res = await fetch(streamUrl, {
    headers: streamHeaders(),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    throw new Error(`Audio fetch failed (${res.status})`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer())
    return { bytes: buf, partial: false, totalBytes: totalBytes ?? buf.byteLength }
  }

  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    if (loaded + value.byteLength > maxBytes) {
      const slice = value.subarray(0, maxBytes - loaded)
      chunks.push(slice)
      loaded += slice.byteLength
      break
    }
    chunks.push(value)
    loaded += value.byteLength
  }

  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }

  const knownTotal = totalBytes ?? (Number(res.headers.get("Content-Length")) || null)
  const partial = knownTotal != null ? knownTotal > loaded : loaded >= maxBytes
  return { bytes: out, partial, totalBytes: knownTotal }
}

export function planByteChunks(
  totalBytes: number,
  maxTotalBytes: number,
  chunkSize: number,
  maxChunks: number,
): Array<{ byteStart: number; byteEnd: number }> {
  const cappedTotal = Math.min(totalBytes, maxTotalBytes)
  const plans: Array<{ byteStart: number; byteEnd: number }> = []

  for (let start = 0; start < cappedTotal && plans.length < maxChunks; start += chunkSize) {
    const end = Math.min(start + chunkSize, cappedTotal) - 1
    if (end >= start) plans.push({ byteStart: start, byteEnd: end })
  }

  return plans
}

export function chunkTimeOffsetSec(
  byteStart: number,
  totalBytes: number,
  durationSec: number | undefined,
  chunkIndex: number,
): number {
  if (totalBytes > 0 && durationSec && durationSec > 0) {
    return (byteStart / totalBytes) * durationSec
  }
  return chunkIndex * CHUNK_DURATION_SEC
}

export async function runWhisper(
  ai: NonNullable<TranscribeEnv["AI"]>,
  audioBase64: string,
  options: { language?: string; initialPrompt?: string; vadFilter?: boolean },
): Promise<WhisperResponse> {
  const input: Record<string, unknown> = {
    audio: audioBase64,
    vad_filter: options.vadFilter ?? true,
  }
  if (options.language?.trim()) input.language = options.language.trim()
  if (options.initialPrompt?.trim()) input.initial_prompt = options.initialPrompt.trim()

  const result = await ai.run("@cf/openai/whisper-large-v3-turbo", input)
  return unwrapWhisperResponse(result)
}

export async function transcribeAudioBuffer(
  ai: NonNullable<TranscribeEnv["AI"]>,
  bytes: Uint8Array,
  options: { language?: string; artist?: string; track?: string },
): Promise<TranscribeResult> {
  const initialPrompt = [options.artist, options.track].filter(Boolean).join(" ").trim()
  const base64 = bytesToBase64(bytes)

  let whisper = await runWhisper(ai, base64, {
    language: options.language,
    initialPrompt: initialPrompt || undefined,
    vadFilter: true,
  })

  let segments = segmentsFromWhisper(whisper.segments, whisper.vtt)
  let text = (whisper.text ?? segments.map((s) => s.text).join(" ")).trim()

  if (!text && segments.length === 0) {
    whisper = await runWhisper(ai, base64, {
      language: options.language,
      initialPrompt: initialPrompt || undefined,
      vadFilter: false,
    })
    segments = segmentsFromWhisper(whisper.segments, whisper.vtt)
    text = (whisper.text ?? segments.map((s) => s.text).join(" ")).trim()
  }

  return {
    text,
    segments,
    language: whisper.transcription_info?.language,
    source: "whisper",
  }
}

/** Byte-plan chunking helper — not used for YouTube MP4 streams (see transcribeYouTubeAudio). */
export async function transcribeChunkedStream(
  ai: NonNullable<TranscribeEnv["AI"]>,
  streamUrl: string,
  options: {
    language?: string
    artist?: string
    track?: string
    durationSec?: number
    totalBytes: number
  },
): Promise<TranscribeResult> {
  const plans = planByteChunks(
    options.totalBytes,
    MAX_AUDIO_BYTES,
    CHUNK_BYTE_SIZE,
    MAX_TRANSCRIBE_CHUNKS,
  )

  if (plans.length === 0) {
    throw new Error("EMPTY_AUDIO")
  }

  const chunkSegments: TranscriptSegment[][] = []
  const offsets: number[] = []
  const textParts: string[] = []
  let language: string | undefined

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]
    const bytes = await fetchAudioRange(streamUrl, plan.byteStart, plan.byteEnd)
    if (bytes.byteLength === 0) continue

    const chunk = await transcribeAudioBuffer(ai, bytes, options)
    if (chunk.segments.length === 0 && !chunk.text) continue

    const offset = chunkTimeOffsetSec(plan.byteStart, options.totalBytes, options.durationSec, i)
    offsets.push(offset)
    chunkSegments.push(chunk.segments)
    if (chunk.text) textParts.push(chunk.text)
    language = language ?? chunk.language
  }

  const segments = mergeTranscriptSegmentsWithOffsets(chunkSegments, offsets)
  const text = (segments.map((s) => s.text).join(" ") || textParts.join(" ")).trim()

  return {
    text,
    segments,
    language,
    source: "whisper",
    partial: options.totalBytes > MAX_AUDIO_BYTES || plans.length > 1,
    chunks: plans.length,
  }
}

function computeVocalMetrics(
  segments: TranscriptSegment[],
  coverageSec: number,
): { vocalDensity: number; coverageSec: number } {
  const vocalDuration = segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0)
  const vocalDensity = coverageSec > 0 ? Math.min(1, vocalDuration / coverageSec) : 0
  return { vocalDensity, coverageSec }
}

export async function transcribeYouTubeAudio(
  env: TranscribeEnv,
  request: TranscribeRequest,
): Promise<TranscribeResult> {
  if (!env.AI) {
    throw new Error("Workers AI binding not configured")
  }

  const videoId = request.videoId.trim()
  let streamUrl: string | null = null

  const workerResolved = await resolveYouTubeStream(videoId, "audio")
  if (workerResolved && isAllowedStreamUrl(workerResolved.url)) {
    streamUrl = workerResolved.url
  } else if (request.streamUrl?.trim()) {
    streamUrl = decodeStreamReference(request.streamUrl)
    if (!streamUrl) {
      throw new Error("INVALID_STREAM_URL")
    }
  } else {
    throw new Error("STREAM_UNAVAILABLE")
  }

  const whisperOptions = {
    language: request.language,
    artist: request.artist,
    track: request.track,
    durationSec: request.durationSec,
  }

  const maxBytes = request.mode === "sample" ? SAMPLE_MAX_AUDIO_BYTES : MAX_AUDIO_BYTES

  // Progressive MP4/M4A from YouTube cannot be split at arbitrary byte offsets —
  // only the first range includes the moov atom. Fetch up to maxBytes once
  // and run a single Whisper call (see transcribeChunkedStream for byte-plan helpers).
  const { bytes, partial: fetchPartial, totalBytes: fetchedTotal } = await fetchAudioBytes(
    streamUrl,
    maxBytes,
  )
  if (bytes.byteLength === 0) {
    throw new Error("EMPTY_AUDIO")
  }

  let result = await transcribeAudioBuffer(env.AI, bytes, whisperOptions)
  result = { ...result, partial: fetchPartial || undefined, chunks: 1 }
  if (fetchedTotal != null && fetchedTotal > bytes.byteLength) {
    result.partial = true
  }

  if (result.segments.length === 0 && !result.text) {
    throw new Error("EMPTY_TRANSCRIPT")
  }

  const lastSegmentEndSec = result.segments.reduce((max, seg) => Math.max(max, seg.end), 0)
  const coveragePartial =
    typeof request.durationSec === "number" &&
    request.durationSec > 30 &&
    lastSegmentEndSec < request.durationSec - 30

  const coverageSec = Math.max(lastSegmentEndSec, request.durationSec ?? 0)
  const metrics = computeVocalMetrics(result.segments, coverageSec)

  return {
    ...result,
    partial: result.partial || coveragePartial || request.mode === "sample" || undefined,
    mode: request.mode ?? "full",
    vocalDensity: metrics.vocalDensity,
    coverageSec: metrics.coverageSec,
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

  const ip = clientIp(request)
  const rate = checkTranscribeRateLimit(ip)
  if (!rate.allowed) {
    return jsonResponse(
      {
        error: "Transcription rate limit exceeded — try again later",
        retryAfterSec: rate.retryAfterSec,
      },
      429,
    )
  }

  try {
    const result = await transcribeYouTubeAudio(env, { ...body, videoId })
    return jsonResponse(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed"
    if (message === "INVALID_STREAM_URL") {
      return jsonResponse({ error: "Invalid stream URL" }, 400)
    }
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
    return jsonResponse({ error: "Transcription failed" }, 500)
  }
}
