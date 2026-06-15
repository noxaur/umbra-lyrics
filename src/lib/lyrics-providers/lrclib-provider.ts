import {
  fetchLyricsById,
  fetchLyricsByMetadata,
  hasLyrics,
  pickBestMatch,
  searchByParams,
  searchByQuery,
  type SearchResult,
} from "@/lib/lyrics-service"
import { simplifyTrackName, stripDecorativeTitle } from "@/lib/parse-track-title"
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
    const byMetadata = await fetchLyricsByMetadata(match)
    if (byMetadata?.plainLyrics?.trim() || byMetadata?.syncedLyrics?.trim()) return byMetadata

    const byId = await fetchLyricsById(match.id)
    if (byId?.plainLyrics?.trim() || byId?.syncedLyrics?.trim()) return byId

    return {
      id: match.id,
      providerId: "lrclib" as const,
      plainLyrics: match.plainLyrics ?? null,
      syncedLyrics: match.syncedLyrics ?? null,
    }
  }

  const byId = await fetchLyricsById(match.id)
  if (byId?.plainLyrics?.trim() || byId?.syncedLyrics?.trim()) return byId

  const byMetadata = await fetchLyricsByMetadata(match)
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
    const author = params.oembedAuthor.trim()
    strategies.push(async () => {
      const queries = [author, `${author} ${simplifiedTrack}`, `${author} ${params.track}`].filter(
        Boolean,
      )
      const byId = new Map<number, SearchResult>()
      for (const query of queries) {
        for (const result of await searchByQuery(query)) {
          byId.set(result.id, result)
        }
      }
      return [...byId.values()]
    })
  }

  if ((simplifiedTrack || params.track).trim()) {
    strategies.push(() => searchByParams(simplifiedTrack || params.track, ""))
  }

  if (simplifiedTitle.trim() || simplifiedTrack.trim()) {
    strategies.push(async () => {
      const results: SearchResult[] = []
      if (simplifiedTitle) results.push(...(await searchByQuery(simplifiedTitle)))
      if (simplifiedTrack && simplifiedTrack !== simplifiedTitle) {
        results.push(...(await searchByParams(simplifiedTrack, params.artist)))
      }
      const byId = new Map<number, SearchResult>()
      for (const result of results) byId.set(result.id, result)
      return [...byId.values()]
    })
  }

  return strategies
}

export async function searchLrclibWithStrategies(
  params: ProviderSearchParams,
  onStrategy?: (phase: string) => void,
): Promise<ProviderLyricsCandidate[]> {
  const strategies = buildStrategies(params)
  onStrategy?.("Searching LRCLIB…")

  const batches = await Promise.all(
    strategies.map(async (run) => {
      try {
        return await run()
      } catch {
        return []
      }
    }),
  )

  const byId = new Map<number, ProviderLyricsCandidate>()
  for (const results of batches) {
    for (const result of results) {
      if (!hasLyricsText(result) && result.instrumental) continue
      const candidate = toCandidate(result, params)
      const existing = byId.get(result.id)
      if (!existing || candidate.confidence < existing.confidence) {
        byId.set(result.id, candidate)
      }
    }
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
  priority: 1,
  supportsSync: true,
  searchPhase: "Searching LRCLIB…",
  async search(params) {
    const candidates = await searchLrclibWithStrategies(params)
    const best = pickBestCandidate(candidates, params.durationSec, params.artist, params.track)
    if (!best) return []

    const ranked = [
      best,
      ...candidates
        .filter((c) => c.externalId !== best.externalId)
        .sort((a, b) => a.confidence - b.confidence),
    ]

    const resolved: ProviderLyricsCandidate[] = []
    const top = ranked.slice(0, 3)
    const fetched = await Promise.all(top.map((candidate) => fetchLrclibCandidate(candidate)))
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
