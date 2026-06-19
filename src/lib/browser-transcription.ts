import { fetchStreamBytes, fetchStreamInfo } from "@/lib/mkv-export/stream-fetch"
import type { TranscriptSegment } from "@/lib/transcript-to-lyrics"

export type BrowserTranscriptionProgress = {
  phase: "audio" | "model" | "transcribing"
  progress?: number
  message: string
}

const SAMPLE_DURATION_SEC = 90
const SAMPLE_RATE = 16_000

export type BrowserTranscriptionOptions = {
  videoId: string
  language?: string
  durationSec?: number
  signal?: AbortSignal
  mode?: "sample" | "full"
  onProgress?: (progress: BrowserTranscriptionProgress) => void
}

export type BrowserTranscriptionResult = {
  text: string
  segments: TranscriptSegment[]
  language?: string
  source: "whisper"
  partial?: boolean
  chunks?: number
  vocalDensity?: number
  coverageSec?: number
  mode: "sample" | "full"
}

export type RawTranscriptionChunk = {
  text?: string
  timestamp?: [number | null, number | null]
}

type WorkerResult = {
  text: string
  chunks?: RawTranscriptionChunk[]
  language?: string
}

type TranscriptionWorkerMessage =
  | { type: "progress"; progress: BrowserTranscriptionProgress }
  | { type: "result"; result: WorkerResult }
  | { type: "error"; message: string }

export function selectTranscriptionDevice(hasWebGpu: boolean): "webgpu" | "wasm" {
  return hasWebGpu ? "webgpu" : "wasm"
}

export function normalizeTranscriptionChunks(
  chunks: RawTranscriptionChunk[] | undefined,
): TranscriptSegment[] {
  if (!chunks) return []
  return chunks.flatMap((chunk) => {
    const text = chunk.text?.trim() ?? ""
    if (!text) return []
    const start = Math.max(0, chunk.timestamp?.[0] ?? 0)
    const rawEnd = chunk.timestamp?.[1]
    const end = Math.max(start + 0.05, rawEnd ?? start + 0.05)
    return [{ start, end, text }]
  })
}

function resampleChannel(channel: Float32Array, sourceRate: number, targetRate = 16_000): Float32Array {
  if (sourceRate === targetRate) return channel.slice()
  const outputLength = Math.max(1, Math.round(channel.length * targetRate / sourceRate))
  const output = new Float32Array(outputLength)
  const ratio = sourceRate / targetRate
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(channel.length - 1, left + 1)
    const mix = position - left
    output[i] = channel[left] * (1 - mix) + channel[right] * mix
  }
  return output
}

async function decodeAudio(bytes: Uint8Array): Promise<Float32Array> {
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
  if (!AudioContextCtor) throw new Error("Browser audio decoding unavailable")
  const context = new AudioContextCtor()
  try {
    const source = bytes.slice().buffer
    const decoded = await context.decodeAudioData(source)
    const mono = new Float32Array(decoded.length)
    for (let channelIndex = 0; channelIndex < decoded.numberOfChannels; channelIndex++) {
      const channel = decoded.getChannelData(channelIndex)
      for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / decoded.numberOfChannels
    }
    return resampleChannel(mono, decoded.sampleRate)
  } finally {
    await context.close()
  }
}

function runWorker(
  audio: Float32Array,
  options: BrowserTranscriptionOptions,
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./transcription.worker.ts", import.meta.url), {
      type: "module",
    })
    const abort = () => {
      worker.terminate()
      reject(new DOMException("Transcription aborted", "AbortError"))
    }
    options.signal?.addEventListener("abort", abort, { once: true })
    if (options.signal?.aborted) {
      abort()
      return
    }

    worker.onmessage = (event: MessageEvent<TranscriptionWorkerMessage>) => {
      const message = event.data
      if (message.type === "progress") {
        options.onProgress?.(message.progress)
        return
      }
      options.signal?.removeEventListener("abort", abort)
      worker.terminate()
      if (message.type === "result") resolve(message.result)
      else reject(new Error(message.message))
    }
    worker.onerror = (event) => {
      options.signal?.removeEventListener("abort", abort)
      worker.terminate()
      reject(new Error(event.message || "Browser transcription worker failed"))
    }
    worker.postMessage(
      {
        type: "transcribe",
        audio: audio.buffer,
        language: options.language,
        device: selectTranscriptionDevice("gpu" in navigator),
      },
      [audio.buffer],
    )
  })
}

function trimAudioForSample(audio: Float32Array): Float32Array {
  const maxSamples = SAMPLE_DURATION_SEC * SAMPLE_RATE
  return audio.length > maxSamples ? audio.slice(0, maxSamples) : audio
}

export { trimAudioForSample }

export async function transcribeInBrowser(
  options: BrowserTranscriptionOptions,
): Promise<BrowserTranscriptionResult> {
  const mode = options.mode ?? "full"
  options.onProgress?.({ phase: "audio", message: "Downloading audio in browser…" })
  const stream = await fetchStreamInfo(options.videoId, "audio")
  const bytes = await fetchStreamBytes(stream.streamUrl, undefined, options.signal)
  options.onProgress?.({ phase: "audio", message: "Preparing audio in browser…" })
  let audio = await decodeAudio(bytes)
  if (mode === "sample") audio = trimAudioForSample(audio)
  const result = await runWorker(audio, options)
  const segments = normalizeTranscriptionChunks(result.chunks)
  const text = (segments.map((segment) => segment.text).join(" ") || result.text).trim()
  if (!text) throw new Error("No speech detected in audio")

  const coverageSec = segments.reduce((max, segment) => Math.max(max, segment.end), 0)
  const vocalDuration = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.end - segment.start),
    0,
  )
  const durationSec = options.durationSec ?? coverageSec

  return {
    text,
    segments,
    language: result.language,
    source: "whisper",
    partial:
      mode === "sample" ||
      (durationSec > 30 && coverageSec < durationSec - 30) ||
      undefined,
    chunks: segments.length,
    vocalDensity: durationSec > 0 ? Math.min(1, vocalDuration / durationSec) : 0,
    coverageSec,
    mode,
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
