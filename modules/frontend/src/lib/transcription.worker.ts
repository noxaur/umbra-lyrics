import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers"

const MODEL = "onnx-community/whisper-base"

type Device = "webgpu" | "wasm"

type RequestMessage = {
  type: "transcribe"
  audio: ArrayBuffer
  language?: string
  device: Device
}

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let activeDevice: Device | null = null

function report(
  phase: "model" | "transcribing",
  message: string,
  progress?: number,
): void {
  self.postMessage({ type: "progress", progress: { phase, message, progress } })
}

async function loadTranscriber(device: Device): Promise<AutomaticSpeechRecognitionPipeline> {
  if (transcriber && activeDevice === device) return transcriber
  report("model", `Loading Whisper model (${device.toUpperCase()})…`)
  const createPipeline = pipeline as unknown as (
    task: "automatic-speech-recognition",
    model: string,
    options: Record<string, unknown>,
  ) => Promise<AutomaticSpeechRecognitionPipeline>
  transcriber = await createPipeline("automatic-speech-recognition", MODEL, {
    device,
    dtype: "q4",
    progress_callback: (event: unknown) => {
      const progress =
        event && typeof event === "object" && "progress" in event
          ? Number(event.progress)
          : undefined
      report("model", `Loading Whisper model (${device.toUpperCase()})…`, progress)
    },
  })
  activeDevice = device
  return transcriber
}

async function transcribe(message: RequestMessage) {
  const devices: Device[] = message.device === "webgpu" ? ["webgpu", "wasm"] : ["wasm"]
  let lastError: unknown
  for (const device of devices) {
    try {
      const recognizer = await loadTranscriber(device)
      report("transcribing", `Transcribing in browser (${device.toUpperCase()})…`)
      return await recognizer(new Float32Array(message.audio), {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
        language: message.language || undefined,
        task: "transcribe",
      })
    } catch (error) {
      transcriber = null
      activeDevice = null
      lastError = error
    }
  }
  throw lastError
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  if (event.data.type !== "transcribe") return
  try {
    const result = await transcribe(event.data)
    self.postMessage({ type: "result", result })
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Browser transcription failed",
    })
  }
}
