import {
  fetchLyricsById,
  fetchLyricsByMetadata,
  hasLyrics,
  pickBestMatch,
  searchByParams,
  searchByQuery,
  type SearchResult,
} from "@/lib/lyrics-service"
import { countLyricLines, RANK_WEIGHTS } from "@/lib/lyrics-ranking"
import { simplifyTrackName, stripChannelSuffix, stripDecorativeTitle } from "@/lib/parse-track-title"
import { hasLyricsText, pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import type { LyricsProvider, ProviderLyricsCandidate, ProviderSearchParams } from "./types"

function toCandidate(
  result: SearchResult,
  params: ProviderSearchParams,
): ProviderLyricsCandidate {
  const synced = Boolean(result.syncedLyrics?.trim())
  return {
    providerId: "lrclib",
    externalId: result.id,
    trackName: result.trackName,
    artistName: result.artistName,
    duration: result.duration,
    instrumental: result.instrumental,
    plainLyrics: result.plainLyrics ?? null,
    syncedLyrics: result.syncedLyrics ?? null,
    synced,
    confidence: scoreCandidate(result, params.durationSec, params.artist, params.track),
  }
}

async function resolveLyricsFromMatch(match: SearchResult) {
  if (hasLyrics(match)) {
    return {
      id: match.id,
      providerId: "lrclib" as const,
      plainLyrics: match.plainLyrics ?? null,
      syncedLyrics: match.syncedLyrics ?? null,
    }
  }

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

type SearchPair = {
  track: string
  artist: string
}

function searchPairKey(pair: SearchPair): string {
  return `${pair.track.trim().toLowerCase()}\0${pair.artist.trim().toLowerCase()}`
}

function buildExactPairs(params: ProviderSearchParams): SearchPair[] {
  const pairs: SearchPair[] = []
  const seen = new Set<string>()
  const add = (track: string | undefined, artist: string | undefined) => {
    const pair = { track: track?.trim() ?? "", artist: artist?.trim() ?? "" }
    if (!pair.track) return
    const key = searchPairKey(pair)
    if (seen.has(key)) return
    seen.add(key)
    pairs.push(pair)
  }

  add(params.canonicalTrack, params.canonicalArtist)
  add(params.track, params.artist)
  return pairs
}

function buildBroadStrategies(
  params: ProviderSearchParams,
  exactPairKeys: Set<string>,
): Array<() => Promise<SearchResult[]>> {
  const strippedTitle = stripDecorativeTitle(
    params.title || `${params.artist} - ${params.track}`,
  )
  const simplifiedTrack = simplifyTrackName(params.track)
  const simplifiedTitle = simplifyTrackName(strippedTitle)

  const strategies: Array<() => Promise<SearchResult[]>> = []
  const addParams = (track: string, artist: string) => {
    const pair = { track: track.trim(), artist: artist.trim() }
    if (!pair.track || exactPairKeys.has(searchPairKey(pair))) return
    strategies.push(() => searchByParams(pair.track, pair.artist))
  }

  if (
    params.track.trim() &&
    params.artist.trim() &&
    params.track !== params.artist
  ) {
    addParams(params.artist, params.track)
  }

  if (strippedTitle.trim()) {
    strategies.push(() => searchByQuery(strippedTitle))
  }

  if (params.oembedAuthor?.trim()) {
    const author = stripChannelSuffix(params.oembedAuthor)
    strategies.push(async () => {
      const queries = [author, `${author} ${simplifiedTrack}`, `${author} ${params.track}`].filter(
        Boolean,
      )
      const byId = new Map<number, SearchResult>()
      const settled = await Promise.allSettled(queries.map((query) => searchByQuery(query)))
      for (const outcome of settled) {
        if (outcome.status !== "fulfilled") continue
        for (const result of outcome.value) byId.set(result.id, result)
      }
      return [...byId.values()]
    })
  }

  if ((simplifiedTrack || params.track).trim()) {
    addParams(simplifiedTrack || params.track, "")
  }

  if (simplifiedTitle.trim() || simplifiedTrack.trim()) {
    strategies.push(async () => {
      const searches: Promise<SearchResult[]>[] = []
      if (simplifiedTitle) searches.push(searchByQuery(simplifiedTitle))
      if (simplifiedTrack && simplifiedTrack !== simplifiedTitle) {
        const pair = { track: simplifiedTrack, artist: params.artist }
        if (!exactPairKeys.has(searchPairKey(pair))) {
          searches.push(searchByParams(pair.track, pair.artist))
        }
      }
      const byId = new Map<number, SearchResult>()
      const settled = await Promise.allSettled(searches)
      for (const outcome of settled) {
        if (outcome.status !== "fulfilled") continue
        for (const result of outcome.value) byId.set(result.id, result)
      }
      return [...byId.values()]
    })
  }

  return strategies
}

function findStrongSyncedCandidate(
  candidates: ProviderLyricsCandidate[],
  params: ProviderSearchParams,
  exactPair: SearchPair,
): ProviderLyricsCandidate | null {
  const synced = candidates.filter(
    (candidate) =>
      candidate.synced &&
      !candidate.instrumental &&
      hasLyricsText(candidate) &&
      countLyricLines(candidate) >= RANK_WEIGHTS.MIN_LINES_FOR_FULL,
  )
  const best = pickBestCandidate(
    synced,
    params.durationSec,
    exactPair.artist,
    exactPair.track,
  )
  if (!best) return null
  return scoreCandidate(best, params.durationSec, exactPair.artist, exactPair.track) < 80
    ? best
    : null
}

function mergeStrategyResults(
  byId: Map<number, ProviderLyricsCandidate>,
  results: SearchResult[],
  params: ProviderSearchParams,
): void {
  for (const result of results) {
    if (!hasLyricsText(result) && result.instrumental) continue
    const candidate = toCandidate(result, params)
    const existing = byId.get(result.id)
    if (!existing || candidate.confidence < existing.confidence) {
      byId.set(result.id, candidate)
    }
  }
}

export async function searchLrclibWithStrategies(
  params: ProviderSearchParams,
  onStrategy?: (phase: string) => void,
): Promise<ProviderLyricsCandidate[]> {
  const byId = new Map<number, ProviderLyricsCandidate>()
  const exactPairs = buildExactPairs(params)
  if (exactPairs.length === 0) return []

  onStrategy?.("Searching LRCLIB…")

  for (const pair of exactPairs) {
    try {
      mergeStrategyResults(byId, await searchByParams(pair.track, pair.artist), params)
    } catch {
      // Continue with the next exact pair or broad strategies.
    }

    const strong = findStrongSyncedCandidate([...byId.values()], params, pair)
    if (strong) return [strong]
  }

  const exactPairKeys = new Set(exactPairs.map(searchPairKey))
  const strategies = buildBroadStrategies(params, exactPairKeys)
  const settled = await Promise.allSettled(strategies.map((run) => run()))
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue
    mergeStrategyResults(byId, outcome.value, params)
  }

  return [...byId.values()]
}

export async function fetchLrclibCandidate(
  candidate: ProviderLyricsCandidate,
): Promise<ProviderLyricsCandidate | null> {
  if (candidate.providerId !== "lrclib" || typeof candidate.externalId !== "number") return null

  const match: SearchResult = {
    id: candidate.externalId,
    trackName: candidate.trackName,
    artistName: candidate.artistName,
    duration: candidate.duration ?? 0,
    instrumental: candidate.instrumental,
    plainLyrics: candidate.plainLyrics,
    syncedLyrics: candidate.syncedLyrics,
  }

  const resolved = await resolveLyricsFromMatch(match)
  if (!resolved) return null

  return {
    ...candidate,
    plainLyrics: resolved.plainLyrics,
    syncedLyrics: resolved.syncedLyrics,
    synced: Boolean(resolved.syncedLyrics?.trim()),
  }
}

export const lrclibProvider: LyricsProvider = {
  id: "lrclib",
  label: "LRCLIB",
  priority: 2,
  supportsSync: true,
  searchPhase: "Searching LRCLIB…",
  async search(params) {
    const candidates = await searchLrclibWithStrategies(params)
    const best = pickBestCandidate(candidates, params.durationSec, params.artist, params.track)
    if (!best) return []

    if (hasLyricsText(best)) {
      const synced = Boolean(best.syncedLyrics?.trim())
      return [{ ...best, synced }]
    }

    const ranked = [
      best,
      ...candidates
        .filter((c) => c.externalId !== best.externalId)
        .sort((a, b) => a.confidence - b.confidence),
    ]

    const top = ranked.slice(0, 2)
    const fetched = await Promise.all(top.map((candidate) => fetchLrclibCandidate(candidate)))
    const resolved: ProviderLyricsCandidate[] = []
    for (const full of fetched) {
      if (full && hasLyricsText(full)) resolved.push(full)
    }
    return resolved
  },
}

export function lrclibSearchResultToCandidate(
  result: SearchResult,
  params: ProviderSearchParams,
): ProviderLyricsCandidate {
  return toCandidate(result, params)
}

export { pickBestMatch, hasLyrics }
