import type { LyricsResult } from "@/types/lyrics"
import { looksLikeEnglishLyrics } from "@/lib/language-service"
import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import {
  artistMatchScore,
  hasLyricsText,
  pickBestCandidate,
  trackMatchScore,
} from "@/lib/lyrics-providers/match-utils"
import { simplifyTrackName, stripDecorativeTitle } from "@/lib/parse-track-title"

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
  return proxyFetch(`/api/lyrics/lrclib${path}`)
}

export function hasLyrics(result: SearchResult): boolean {
  return hasLyricsText(result)
}

function searchResultToLyrics(result: SearchResult): LyricsResult {
  return {
    id: result.id,
    providerId: "lrclib",
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

  const strippedTrack = stripDecorativeTitle(params.track)
  const simplifiedTrack = simplifyTrackName(params.track)
  const simplifiedStripped = simplifyTrackName(strippedTrack)
  const artistFirst = params.artist.split(/\s+/)[0] ?? params.artist

  add(params.track, params.artist)
  add(strippedTrack, params.artist)
  add(simplifiedTrack, params.artist)
  add(simplifiedStripped, params.artist)
  add(simplifiedTrack, artistFirst)

  if (
    params.track.trim() &&
    params.artist.trim() &&
    params.track.toLowerCase() !== params.artist.toLowerCase()
  ) {
    add(params.artist, params.track)
  }

  return strategies
}

function mergeSearchResults(byId: Map<number, SearchResult>, results: SearchResult[]): void {
  for (const result of results) {
    byId.set(result.id, result)
  }
}

function isStrongSearchMatch(
  match: SearchResult | null,
  params: FetchLyricsParams,
): boolean {
  if (!match || !hasLyrics(match) || match.instrumental) return false
  return (
    artistMatchScore(match, params.artist) < 80 &&
    trackMatchScore(match, params.track) < 80 &&
    Boolean(match.syncedLyrics?.trim())
  )
}

async function runSearches(
  byId: Map<number, SearchResult>,
  searches: Promise<SearchResult[]>[],
): Promise<void> {
  const settled = await Promise.allSettled(searches)
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") mergeSearchResults(byId, outcome.value)
  }
}

async function collectSearchResults(params: FetchLyricsParams): Promise<SearchResult[]> {
  const byId = new Map<number, SearchResult>()

  await runSearches(
    byId,
    buildSearchStrategies(params).map(({ track, artist }) => searchByParams(track, artist)),
  )

  let match = pickBestMatch([...byId.values()], params.durationSec, params.artist, params.track)
  if (isStrongSearchMatch(match, params)) {
    return [...byId.values()]
  }

  const strippedTrack = stripDecorativeTitle(params.track)
  const queryVariants = [
    [params.track, params.artist].filter(Boolean).join(" "),
    [strippedTrack, params.artist].filter(Boolean).join(" "),
    [simplifyTrackName(params.track), params.artist].filter(Boolean).join(" "),
    [params.artist, params.track].filter(Boolean).join(" "),
  ].filter((value, index, all) => value.trim() && all.indexOf(value) === index)

  await runSearches(byId, queryVariants.map((query) => searchByQuery(query)))

  match = pickBestMatch([...byId.values()], params.durationSec, params.artist, params.track)
  if (match && hasLyrics(match)) {
    return [...byId.values()]
  }

  if (byId.size === 0 && params.track.trim()) {
    try {
      mergeSearchResults(byId, await searchByParams(simplifyTrackName(params.track), ""))
    } catch {
      // empty-track fallback is best-effort
    }
  }

  return [...byId.values()]
}

export function pickBestMatch(
  results: SearchResult[],
  durationSec: number,
  artist: string,
  track = "",
): SearchResult | null {
  return pickBestCandidate(results, durationSec, artist, track)
}

async function fetchLyricsForMatch(match: SearchResult): Promise<LyricsResult | null> {
  const [byIdOutcome, byMetadataOutcome] = await Promise.allSettled([
    fetchLyricsById(match.id),
    fetchLyricsByMetadata(match),
  ])
  const byId = byIdOutcome.status === "fulfilled" ? byIdOutcome.value : null
  const byMetadata = byMetadataOutcome.status === "fulfilled" ? byMetadataOutcome.value : null
  if (byId?.plainLyrics?.trim() || byId?.syncedLyrics?.trim()) return byId
  if (byMetadata?.plainLyrics?.trim() || byMetadata?.syncedLyrics?.trim()) return byMetadata
  return null
}

export async function fetchLyricsById(id: number): Promise<LyricsResult | null> {
  const res = await lrclibFetch(`/get/${id}`)
  if (!res.ok) return null
  const data = await res.json()
  return {
    id: data.id,
    providerId: "lrclib",
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
    providerId: "lrclib",
    plainLyrics: data.plainLyrics ?? null,
    syncedLyrics: data.syncedLyrics ?? null,
  }
}

export async function fetchLyrics(params: FetchLyricsParams): Promise<LyricsResult | null> {
  const results = await collectSearchResults(params)
  const match = pickBestMatch(results, params.durationSec, params.artist, params.track)
  if (!match) return null

  if (hasLyrics(match)) {
    return searchResultToLyrics(match)
  }

  return fetchLyricsForMatch(match)
}

function preferEnglishTitledMatch(
  results: SearchResult[],
  durationSec: number,
  artist: string,
  track: string,
): SearchResult | null {
  const match = pickBestMatch(results, durationSec, artist, track)
  if (!match) return null

  const englishTitled = results.filter(
    (result) =>
      hasLyrics(result) &&
      /\benglish\b/i.test(result.trackName) &&
      artistMatchScore(result, artist) < 80,
  )
  if (englishTitled.length === 0) return match

  return pickBestMatch(englishTitled, durationSec, artist, track) ?? match
}

export async function searchEnglishLyrics(
  track: string,
  artist: string,
  durationSec: number,
): Promise<LyricsResult | null> {
  const strategies = [
    { track, artist },
    { track: `${track} (English)`, artist },
    { track: `${track} english`, artist },
    { track, artist: `${artist} english` },
  ]

  for (const { track: searchTrack, artist: searchArtist } of strategies) {
    const results = await collectSearchResults({
      track: searchTrack,
      artist: searchArtist,
      album: "",
      durationSec,
    })
    const match = preferEnglishTitledMatch(results, durationSec, artist, track)
    if (!match || !hasLyrics(match)) continue
    if (artistMatchScore(match, artist) >= 80 && artist.trim()) continue
    if (trackMatchScore(match, track) >= 80 && track.trim()) continue

    const byMetadata = await fetchLyricsByMetadata(match)
    const candidate =
      byMetadata && (byMetadata.plainLyrics || byMetadata.syncedLyrics)
        ? byMetadata
        : (await fetchLyricsById(match.id)) ?? searchResultToLyrics(match)

    const plain = candidate.plainLyrics?.trim() ?? ""
    if (plain && looksLikeEnglishLyrics(plain)) return candidate
  }

  const queryResults = await searchByQuery(`${artist} ${track} english`.trim())
  const queryMatch = preferEnglishTitledMatch(queryResults, durationSec, artist, track)
  if (queryMatch && hasLyrics(queryMatch)) {
    const byId = await fetchLyricsById(queryMatch.id)
    const candidate = byId?.plainLyrics || byId?.syncedLyrics ? byId : searchResultToLyrics(queryMatch)
    const plain = candidate.plainLyrics?.trim() ?? ""
    if (plain && looksLikeEnglishLyrics(plain)) return candidate
  }

  return null
}
