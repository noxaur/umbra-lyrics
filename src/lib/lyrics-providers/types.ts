import type { LyricsProviderId } from "@/types/lyrics"

export type ProviderSearchParams = {
  track: string
  artist: string
  album?: string
  durationSec: number
  title?: string
  oembedAuthor?: string
}

export type ProviderLyricsCandidate = {
  providerId: LyricsProviderId
  externalId: string | number
  trackName: string
  artistName: string
  duration?: number
  instrumental?: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
  synced: boolean
  confidence: number
}

export type NormalizedLyricsResult = {
  providerId: LyricsProviderId
  id: string | number
  plainLyrics: string | null
  syncedLyrics: string | null
  synced: boolean
  trackName?: string
  artistName?: string
}

export type LyricsProvider = {
  id: LyricsProviderId
  label: string
  priority: number
  supportsSync: boolean
  searchPhase: string
  search(params: ProviderSearchParams): Promise<ProviderLyricsCandidate[]>
}

export type RankedLyricsHit = {
  candidate: ProviderLyricsCandidate
  result: NormalizedLyricsResult
}
