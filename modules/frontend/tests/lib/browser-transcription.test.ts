import { describe, expect, it } from "vite-plus/test"
import {
  normalizeTranscriptionChunks,
  selectTranscriptionDevice,
  trimAudioForSample,
} from "@/lib/browser-transcription"

describe("browser transcription", () => {
  it("prefers WebGPU and otherwise falls back to WASM", () => {
    expect(selectTranscriptionDevice(true)).toBe("webgpu")
    expect(selectTranscriptionDevice(false)).toBe("wasm")
  })

  it("normalizes timestamped chunks into transcript segments", () => {
    expect(
      normalizeTranscriptionChunks([
        { text: " first line ", timestamp: [0, 2.5] },
        { text: "", timestamp: [2.5, 3] },
        { text: "second line", timestamp: [3, null] },
      ]),
    ).toEqual([
      { start: 0, end: 2.5, text: "first line" },
      { start: 3, end: 3.05, text: "second line" },
    ])
  })

  it("trims audio to ~90s for sample transcription", () => {
    const samples = 90 * 16_000 + 5_000
    const audio = new Float32Array(samples)
    expect(trimAudioForSample(audio).length).toBe(90 * 16_000)
  })
})
