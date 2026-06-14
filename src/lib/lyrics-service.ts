import type { LyricsResult } from "@/types/lyrics"
import { simplifyTrackName } from "@/lib/parse-track-title"

const BASE = "https://lrclib.net/api"
const CLIENT_HEADER = "song-kara/1.0.0 (https://github.com/song-kara)"

const DURATION_TOLERANCE_SEC = 15

export type SearchResult = {
  id: number
  trackName: string
  artistName: string
  albumName?: string
  duration: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

export type FetchLyricsParams = {
  track: string
  artist: string
  album: string
  durationSec: number
}

export function lrclibFetch(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: {
      "Lrclib-Client": CLIENT_HEADER,
      "User-Agent": CLIENT_HEADER,
    },
  })
}

export function hasLyrics(result: SearchResult): boolean {
  return Boolean(result.plainLyrics?.trim() || result.syncedLyrics?.trim())
}

function searchResultToLyrics(result: SearchResult): LyricsResult {
  return {
    id: result.id,
    plainLyrics: result.plainLyrics ?? null,
    syncedLyrics: result.syncedLyrics ?? null,
  }
}

export async function searchByParams(track: string, artist: string): Promise<SearchResult[]> {
  const q = new URLSearchParams({ track_name: track, artist_name: artist })
  const res = await lrclibFetch(`/search?${q}`)
  if (!res.ok) return []
  return res.json()
}

export async function searchByQuery(query: string): Promise<SearchResult[]> {
  const q = new URLSearchParams({ q: query })
  const res = await lrclibFetch(`/search?${q}`)
  if (!res.ok) return []
  return res.json()
}

function buildSearchStrategies(params: FetchLyricsParams): Array<{ track: string; artist: string }> {
  const strategies: Array<{ track: string; artist: string }> = []
  const seen = new Set<string>()
  const add = (track: string, artist: string) => {
    const key = `${track}\0${artist}`
    if (!track.trim() || seen.has(key)) return
    seen.add(key)
    strategies.push({ track: track.trim(), artist: artist.trim() })
  }

  const simplifiedTrack = simplifyTrackName(params.track)
  add(params.track, params.artist)
  add(simplifiedTrack, params.artist)
  add(simplifiedTrack, params.artist.split(/\s+/)[0] ?? params.artist)

  return strategies
}

async function collectSearchResults(params: FetchLyricsParams): Promise<SearchResult[]> {
  const byId = new Map<number, SearchResult>()

  for (const { track, artist } of buildSearchStrategies(params)) {
    for (const result of await searchByParams(track, artist)) {
      byId.set(result.id, result)
    }
  }

  const query = [params.track, params.artist].filter(Boolean).join(" ")
  if (query) {
    for (const result of await searchByQuery(query)) {
      byId.set(result.id, result)
    }
  }

  const simplifiedQuery = [simplifyTrackName(params.track), params.artist].filter(Boolean).join(" ")
  if (simplifiedQuery && simplifiedQuery !== query) {
    for (const result of await searchByQuery(simplifiedQuery)) {
      byId.set(result.id, result)
    }
  }

  if (byId.size === 0 && params.track.trim()) {
    for (const result of await searchByParams(simplifyTrackName(params.track), "")) {
      byId.set(result.id, result)
    }
  }

  return [...byId.values()]
}

function artistMatchScore(result: SearchResult, artist: string): number {
  if (!artist.trim()) return 0

  const wanted = artist.trim().toLowerCase()
  const found = result.artistName.trim().toLowerCase()
  if (found === wanted) return 0
  if (found.includes(wanted) || wanted.includes(found)) return 4

  const wantedParts = wanted.split(/\s+/).filter(Boolean)
  if (wantedParts.some((part) => part.length > 1 && found.includes(part))) return 12

  return 80
}

function durationScore(result: SearchResult, durationSec: number): number {
  if (durationSec <= 0) return 0
  const delta = Math.abs(result.duration - durationSec)
  return delta <= DURATION_TOLERANCE_SEC ? delta : delta + 100
}

export function pickBestMatch(
  results: SearchResult[],
  durationSec: number,
  artist: string,
): SearchResult | null {
  if (results.length === 0) return null

  const scored = results
    .map((result) => {
      let score = durationScore(result, durationSec)
      score += artistMatchScore(result, artist)
      if (result.instrumental) score += 50
      if (!hasLyrics(result)) score += 200
      return { result, score }
    })
    .sort((a, b) => a.score - b.score)

  const matchedLyrics = scored.find(
    ({ result }) => hasLyrics(result) && !result.instrumental && artistMatchScore(result, artist) < 80,
  )
  if (matchedLyrics) return matchedLyrics.result

  const vocalLyrics = scored.find(({ result }) => hasLyrics(result) && !result.instrumental)
  if (vocalLyrics) return vocalLyrics.result

  const anyLyrics = scored.find(({ result }) => hasLyrics(result))
  if (anyLyrics) return anyLyrics.result

  return scored[0]?.result ?? null
}

export async function fetchLyricsById(id: number): Promise<LyricsResult | null> {
  const res = await lrclibFetch(`/get/${id}`)
  if (!res.ok) return null
  const data = await res.json()
  return {
    id: data.id,
    plainLyrics: data.plainLyrics ?? null,
    syncedLyrics: data.syncedLyrics ?? null,
  }
}

export async function fetchLyricsByMetadata(match: SearchResult): Promise<LyricsResult | null> {
  const q = new URLSearchParams({
    track_name: match.trackName,
    artist_name: match.artistName,
    album_name: match.albumName ?? "",
    duration: String(match.duration),
  })

  const res = await lrclibFetch(`/get?${q}`)
  if (!res.ok) return null

  const data = await res.json()
  return {
    id: data.id,
    plainLyrics: data.plainLyrics ?? null,
    syncedLyrics: data.syncedLyrics ?? null,
  }
}

export async function fetchLyrics(params: FetchLyricsParams): Promise<LyricsResult | null> {
  const results = await collectSearchResults(params)
  const match = pickBestMatch(results, params.durationSec, params.artist)
  if (!match) return null

  if (hasLyrics(match)) {
    const byMetadata = await fetchLyricsByMetadata(match)
    if (byMetadata && (byMetadata.plainLyrics || byMetadata.syncedLyrics)) {
      return byMetadata
    }

    const byId = await fetchLyricsById(match.id)
    if (byId && (byId.plainLyrics || byId.syncedLyrics)) {
      return byId
    }

    return searchResultToLyrics(match)
  }

  const byId = await fetchLyricsById(match.id)
  if (byId && (byId.plainLyrics || byId.syncedLyrics)) {
    return byId
  }

  const byMetadata = await fetchLyricsByMetadata(match)
  if (byMetadata && (byMetadata.plainLyrics || byMetadata.syncedLyrics)) {
    return byMetadata
  }

  return null
}

export async function searchEnglishLyrics(
  track: string,
  artist: string,
  durationSec: number,
): Promise<LyricsResult | null> {
  return fetchLyrics({
    track: `${track} english`,
    artist,
    album: "",
    durationSec,
  })
}
