export type LyricLine = { startMs: number; endMs: number; text: string }
export type ParsedLyrics = { lines: LyricLine[]; synced: boolean }

export type LyricDisplayMode = "native" | "english" | "both"

export type LyricsResult = {
  id: number
  plainLyrics: string | null
  syncedLyrics: string | null
}
