export type LyricLine = { startMs: number; endMs: number; text: string }
export type ParsedLyrics = { lines: LyricLine[]; synced: boolean }

export type LyricDisplayMode = "native" | "english" | "both"

export type LyricsProviderId = "lrclib" | "lyrics-ovh" | "megalobiz" | "musicbrainz"

export const LYRICS_PROVIDER_LABELS: Record<LyricsProviderId, string> = {
  lrclib: "LRCLIB",
  "lyrics-ovh": "lyrics.ovh",
  megalobiz: "Megalobiz",
  musicbrainz: "MusicBrainz",
}

export type LyricsResult = {
  id: number | string
  providerId: LyricsProviderId
  plainLyrics: string | null
  syncedLyrics: string | null
}
