export type LyricWord = { text: string; startMs: number; endMs: number }

export type LyricLine = {
  startMs: number
  endMs: number
  text: string
  /** Small muted section label shown above lyric (Spotify-style) */
  sectionLabel?: string
  /** `section` = standalone structure tag row, not highlighted as sung content */
  kind?: "lyric" | "section"
  /** Per-word timestamps from enhanced LRC or forced alignment */
  words?: LyricWord[]
}

export type LyricStageMode = "idle" | "intro" | "lyric" | "gap" | "outro"

export type LyricStageState = {
  mode: LyricStageMode
  activeIndex: number
  gapLabel?: string
  wordIndex: number
  wordProgress: number
}

export type ParsedLyrics = { lines: LyricLine[]; synced: boolean; autoTimed?: boolean; aligned?: boolean }

export type LyricDisplayMode = "native" | "english" | "both"

export type LyricsProviderId =
  | "lrclib"
  | "lyrics-ovh"
  | "megalobiz"
  | "musicbrainz"
  | "aggregated-scraper"
  | "chartlyrics"
  | "genius"
  | "petitlyrics"
  | "lyricstranslate"
  | "animelyrics"
  | "vagalume"
  | "lyricswiki"
  | "songmeanings"
  | "letras"

export const LYRICS_PROVIDER_LABELS: Record<LyricsProviderId, string> = {
  lrclib: "LRCLIB",
  "lyrics-ovh": "lyrics.ovh",
  megalobiz: "Megalobiz",
  musicbrainz: "MusicBrainz",
  "aggregated-scraper": "Web scrapers",
  chartlyrics: "ChartLyrics",
  genius: "Genius",
  petitlyrics: "PetitLyrics",
  lyricstranslate: "LyricsTranslate",
  animelyrics: "AnimeLyrics",
  vagalume: "Vagalume",
  lyricswiki: "Lyrics Wiki",
  songmeanings: "SongMeanings",
  letras: "Letras.mus.br",
}

export type LyricsResult = {
  id: number | string
  providerId: LyricsProviderId
  plainLyrics: string | null
  syncedLyrics: string | null
}

export type LyricsAlternate = {
  providerId: LyricsProviderId
  id: number | string
  trackName?: string
  artistName?: string
  synced: boolean
  lineCount: number
  rankScore: number
  lyricsResult: LyricsResult
}
