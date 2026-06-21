import {
  transcribeInBrowser,
  type BrowserTranscriptionProgress,
} from "@/lib/browser-transcription"
import type { ProviderLyricsCandidate } from "@/lib/lyrics-providers/types"
import type { TranscriptSegment } from "@/lib/transcript-to-lyrics"
import { transcriptToPlainLyrics } from "@/lib/transcript-to-lyrics"

export type TranscribeResponse = {
  text: string
  segments: TranscriptSegment[]
  language?: string
  source: "whisper"
  partial?: boolean
  chunks?: number
  retryAfterSec?: number
  vocalDensity?: number
  coverageSec?: number
  mode?: "sample" | "full"
}

export type TranscribeOptions = {
  videoId: string
  artist?: string
  track?: string
  language?: string
  durationSec?: number
  signal?: AbortSignal
  mode?: "sample" | "full"
  onProgress?: (progress: BrowserTranscriptionProgress) => void
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
  try {
    return await transcribeInBrowser(options)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new TranscriptionError(
      error instanceof Error ? error.message : "Browser transcription failed",
      0,
    )
  }
}

/** Fast sample transcription for lyrics verification (~90s of audio). */
export async function sampleTranscribeForVerification(
  options: Omit<TranscribeOptions, "mode">,
): Promise<TranscribeResponse | null> {
  try {
    return await transcribeFromYouTube({ ...options, mode: "sample" })
  } catch {
    return null
  }
}

export type TranscriptionAsProvider = {
  candidate: ProviderLyricsCandidate
  partial: boolean
  language?: string
}

/** Full-track transcription packaged as a first-class lyrics provider candidate. */
export async function fullTranscribeAsProvider(
  options: TranscribeOptions,
): Promise<TranscriptionAsProvider | null> {
  try {
    const transcript = await transcribeFromYouTube({ ...options, mode: "full" })
    const plainLyrics = transcriptToPlainLyrics(transcript.segments) || transcript.text.trim()
    if (!plainLyrics) return null

    return {
      candidate: {
        providerId: "transcription",
        externalId: `transcription:${options.videoId}`,
        trackName: options.track ?? "",
        artistName: options.artist ?? "",
        plainLyrics,
        syncedLyrics: null,
        synced: false,
        confidence: 1,
        languageHint: transcript.language,
      },
      partial: transcript.partial ?? false,
      language: transcript.language,
    }
  } catch {
    return null
  }
}
