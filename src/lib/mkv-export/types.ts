import type { LyricLine } from "@/types/lyrics"

export type MkvExportInput = {
  videoId: string
  title: string
  artist: string
  track: string
  durationMs: number
  syncOffsetMs: number
  native: { languageCode: string; lines: LyricLine[] }
  english?: { lines: string[] }
  includeVideo: boolean
  includeEnglish: boolean
}

export type MkvExportProgress =
  | "idle"
  | "loading-ffmpeg"
  | "fetching-media"
  | "muxing"
  | "done"
  | "error"

export type VocalLineTiming = {
  index: number
  startMs: number
  endMs: number
  text: string
}
