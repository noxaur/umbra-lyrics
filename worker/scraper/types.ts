export type ScraperSourceId =
  | "genius"
  | "azlyrics"
  | "lyricscom"
  | "musixmatch"
  | "animelyrics"
  | "lyrical-nonsense"

export type ScraperSearchParams = {
  q?: string
  artist: string
  track: string
}

export type ScraperHit = {
  source: ScraperSourceId
  sourceId: string
  url: string
  trackName: string
  artistName: string
  plainLyrics: string | null
  syncedLyrics: string | null
  confidence: number
}

export type ScraperExtractor = {
  id: ScraperSourceId
  label: string
  priority: number
  search(params: ScraperSearchParams): Promise<ScraperHit[]>
}

export type LrcFetchResult = {
  source: string
  trackName: string
  artistName: string
  syncedLyrics: string
  plainLyrics: string | null
  url?: string
}
