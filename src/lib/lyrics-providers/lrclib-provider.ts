import {
  fetchLyricsById,
  fetchLyricsByMetadata,
  hasLyrics,
  pickBestMatch,
  searchByParams,
  searchByQuery,
  type SearchResult,
} from "@/lib/lyrics-service"
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

function buildStrategies(params: ProviderSearchParams): Array<() => Promise<SearchResult[]>> {
  const strippedTitle = stripDecorativeTitle(
    params.title || `${params.artist} - ${params.track}`,
  )
  const simplifiedTrack = simplifyTrackName(params.track)
  const simplifiedTitle = simplifyTrackName(strippedTitle)

  const strategies: Array<() => Promise<SearchResult[]>> = []

  if (params.track.trim()) {
    strategies.push(() => searchByParams(params.track, params.artist))
  }

  if (
    params.track.trim() &&
    params.artist.trim() &&
    params.track !== params.artist
  ) {
    strategies.push(() => searchByParams(params.artist, params.track))
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
    strategies.push(() => searchByParams(simplifiedTrack || params.track, ""))
  }

  if (simplifiedTitle.trim() || simplifiedTrack.trim()) {
    strategies.push(async () => {
      const searches: Promise<SearchResult[]>[] = []
      if (simplifiedTitle) searches.push(searchByQuery(simplifiedTitle))
      if (simplifiedTrack && simplifiedTrack !== simplifiedTitle) {
        searches.push(searchByParams(simplifiedTrack, params.artist))
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
  const strategies = buildStrategies(params)
  if (strategies.length === 0) return []

  onStrategy?.("Searching LRCLIB…")

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
