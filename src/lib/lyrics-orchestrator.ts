import type { LyricsResult } from "@/types/lyrics"
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

export type LyricsSearchAttempt = {
  strategy: string
  result: "found" | "empty" | "error" | "skipped"
  message?: string
}

export type LyricsOrchestratorStatus = "found" | "partial" | "not_found" | "instrumental"

export type LyricsOrchestratorResult = {
  status: LyricsOrchestratorStatus
  strategy: string
  attempts: LyricsSearchAttempt[]
  lyrics?: LyricsResult
  message: string
  matchId?: number
  instrumental?: boolean
  synced: boolean
}

export type LyricsSearchStep = "parse" | "search" | "match" | "ready"

export type OrchestratorProgress = {
  phase: string
  step: LyricsSearchStep
  retryRound?: number
  maxRetries?: number
}

export type OrchestratorParams = {
  track: string
  artist: string
  title: string
  durationSec: number
  oembedAuthor?: string
  onProgress?: (update: OrchestratorProgress) => void
}

const RETRY_DELAYS_MS = [500, 1500]

type StrategyDef = {
  name: string
  phase: string
  run: () => Promise<SearchResult[]>
  skip?: () => boolean
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /fetch|network/i.test(error.message))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, maxAttempts: number) => void,
): Promise<T> {
  const maxAttempts = RETRY_DELAYS_MS.length + 1
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isNetworkError(error) || attempt >= maxAttempts) throw error
      onRetry?.(attempt + 1, maxAttempts)
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1500)
    }
  }

  throw lastError
}

function searchResultToLyrics(result: SearchResult): LyricsResult {
  return {
    id: result.id,
    plainLyrics: result.plainLyrics ?? null,
    syncedLyrics: result.syncedLyrics ?? null,
  }
}

function lyricsFromResult(result: LyricsResult | null): LyricsResult | null {
  if (!result) return null
  if (result.plainLyrics?.trim() || result.syncedLyrics?.trim()) return result
  return null
}

async function resolveLyricsFromMatch(match: SearchResult): Promise<LyricsResult | null> {
  if (hasLyrics(match)) {
    const byMetadata = await fetchLyricsByMetadata(match)
    const resolved = lyricsFromResult(byMetadata)
    if (resolved) return resolved

    const byId = await fetchLyricsById(match.id)
    const fromId = lyricsFromResult(byId)
    if (fromId) return fromId

    return searchResultToLyrics(match)
  }

  const byId = await fetchLyricsById(match.id)
  const fromId = lyricsFromResult(byId)
  if (fromId) return fromId

  const byMetadata = await fetchLyricsByMetadata(match)
  return lyricsFromResult(byMetadata)
}

function rankCandidates(results: SearchResult[], durationSec: number, artist: string): SearchResult[] {
  const best = pickBestMatch(results, durationSec, artist)
  if (!best) return []

  const rest = results
    .filter((r) => r.id !== best.id)
    .sort((a, b) => {
      const score = (r: SearchResult) => {
        let s = Math.abs(r.duration - durationSec)
        if (r.instrumental) s += 50
        if (!hasLyrics(r)) s += 200
        return s
      }
      return score(a) - score(b)
    })

  return [best, ...rest]
}

async function tryResultsForLyrics(
  results: SearchResult[],
  durationSec: number,
  artist: string,
  preferVocal: boolean,
  onProgress?: (phase: string) => void,
): Promise<{ lyrics: LyricsResult; match: SearchResult; synced: boolean } | null> {
  const ranked = rankCandidates(results, durationSec, artist)
  if (ranked.length === 0) return null

  const vocalFirst = preferVocal
    ? [...ranked.filter((r) => !r.instrumental && hasLyrics(r)), ...ranked.filter((r) => r.instrumental || !hasLyrics(r))]
    : ranked

  for (const match of vocalFirst) {
    onProgress?.(`Fetching lyrics for “${match.trackName}”…`)
    const lyrics = await resolveLyricsFromMatch(match)
    if (!lyrics) continue
    if (preferVocal && match.instrumental && !hasLyrics(match)) continue

    const synced = Boolean(lyrics.syncedLyrics?.trim())
    return { lyrics, match, synced }
  }

  return null
}

function buildStrategies(params: OrchestratorParams): StrategyDef[] {
  const strippedTitle = stripDecorativeTitle(params.title || `${params.artist} - ${params.track}`)
  const simplifiedTrack = simplifyTrackName(params.track)
  const simplifiedTitle = simplifyTrackName(strippedTitle)

  return [
    {
      name: "artist_track",
      phase: "Searching LRCLIB (artist + track)…",
      run: () => searchByParams(params.track, params.artist),
      skip: () => !params.track.trim(),
    },
    {
      name: "swapped_artist_track",
      phase: "Trying swapped artist/track…",
      run: () => searchByParams(params.artist, params.track),
      skip: () => !params.track.trim() || !params.artist.trim() || params.track === params.artist,
    },
    {
      name: "query_full_title",
      phase: "Searching by full title…",
      run: () => searchByQuery(strippedTitle),
      skip: () => !strippedTitle.trim(),
    },
    {
      name: "query_oembed_author",
      phase: "Searching by channel name…",
      run: async () => {
        const author = params.oembedAuthor?.trim()
        if (!author) return []
        const queries = [author, `${author} ${simplifiedTrack}`, `${author} ${params.track}`].filter(Boolean)
        const byId = new Map<number, SearchResult>()
        for (const query of queries) {
          for (const result of await searchByQuery(query)) {
            byId.set(result.id, result)
          }
        }
        return [...byId.values()]
      },
      skip: () => !params.oembedAuthor?.trim(),
    },
    {
      name: "track_only_duration",
      phase: "Searching track name with duration match…",
      run: () => searchByParams(simplifiedTrack || params.track, ""),
      skip: () => !(simplifiedTrack || params.track).trim(),
    },
    {
      name: "simplified_title",
      phase: "Searching simplified title…",
      run: async () => {
        const results: SearchResult[] = []
        if (simplifiedTitle) {
          results.push(...(await searchByQuery(simplifiedTitle)))
        }
        if (simplifiedTrack && simplifiedTrack !== simplifiedTitle) {
          results.push(...(await searchByParams(simplifiedTrack, params.artist)))
        }
        const byId = new Map<number, SearchResult>()
        for (const result of results) byId.set(result.id, result)
        return [...byId.values()]
      },
      skip: () => !simplifiedTitle.trim() && !simplifiedTrack.trim(),
    },
  ]
}

export async function orchestrateLyricsSearch(
  params: OrchestratorParams,
): Promise<LyricsOrchestratorResult> {
  const attempts: LyricsSearchAttempt[] = []
  const allResults = new Map<number, SearchResult>()
  let bestEmptyMatch: SearchResult | null = null
  let instrumentalMatch: SearchResult | null = null

  const report = (phase: string, step: LyricsSearchStep, retryRound?: number, maxRetries?: number) => {
    params.onProgress?.({ phase, step, retryRound, maxRetries })
  }

  report("Parsing title…", "parse")

  const strategies = buildStrategies(params)

  for (const strategy of strategies) {
    if (strategy.skip?.()) {
      attempts.push({ strategy: strategy.name, result: "skipped", message: "Nothing to search" })
      continue
    }

    report(strategy.phase, "search")

    let results: SearchResult[] = []
    try {
      results = await withNetworkRetry(strategy.run, (retryRound, maxRetries) => {
        report(`Retrying (${retryRound}/${maxRetries})…`, "search", retryRound, maxRetries)
      })
    } catch (error) {
      attempts.push({
        strategy: strategy.name,
        result: "error",
        message: error instanceof Error ? error.message : "Network error",
      })
      continue
    }

    for (const result of results) allResults.set(result.id, result)

    if (results.length === 0) {
      attempts.push({ strategy: strategy.name, result: "empty", message: "No matches" })
      continue
    }

    report("Matching results…", "match")

    const hit = await tryResultsForLyrics(
      results,
      params.durationSec,
      params.artist,
      true,
      (phase) => report(phase, "match"),
    )

    if (hit) {
      attempts.push({ strategy: strategy.name, result: "found" })
      report(hit.synced ? "Found synced lyrics" : "Found plain lyrics", "ready")
      return {
        status: "found",
        strategy: strategy.name,
        attempts,
        lyrics: hit.lyrics,
        message: hit.synced ? "Found synced lyrics" : "Found plain lyrics",
        matchId: hit.match.id,
        instrumental: hit.match.instrumental,
        synced: hit.synced,
      }
    }

    const best = pickBestMatch(results, params.durationSec, params.artist)
    if (best) {
      if (best.instrumental) instrumentalMatch = best
      else if (!hasLyrics(best)) bestEmptyMatch = best
    }

    attempts.push({ strategy: strategy.name, result: "empty", message: "No lyrics in matches" })
  }

  report("Trying each search result by ID…", "search")

  const resultsWithLyrics = [...allResults.values()].filter((r) => hasLyrics(r))
  const getByIdCandidates = resultsWithLyrics.length > 0 ? resultsWithLyrics : [...allResults.values()]

  if (getByIdCandidates.length > 0) {
    const hit = await tryResultsForLyrics(
      getByIdCandidates,
      params.durationSec,
      params.artist,
      true,
      (phase) => report(phase, "match"),
    )

    if (hit) {
      attempts.push({ strategy: "get_by_id", result: "found" })
      report(hit.synced ? "Found synced lyrics" : "Found plain lyrics", "ready")
      return {
        status: "found",
        strategy: "get_by_id",
        attempts,
        lyrics: hit.lyrics,
        message: hit.synced ? "Found synced lyrics" : "Found plain lyrics",
        matchId: hit.match.id,
        instrumental: hit.match.instrumental,
        synced: hit.synced,
      }
    }

    attempts.push({ strategy: "get_by_id", result: "empty", message: "No lyrics via /get" })
  }

  report("Trying instrumental matches…", "match")

  const instrumentalHit = await tryResultsForLyrics(
    [...allResults.values()].filter((r) => r.instrumental),
    params.durationSec,
    params.artist,
    false,
    (phase) => report(phase, "match"),
  )

  if (instrumentalHit) {
    attempts.push({ strategy: "instrumental_fallback", result: "found" })
    report("Found instrumental track", "ready")
    return {
      status: "instrumental",
      strategy: "instrumental_fallback",
      attempts,
      lyrics: instrumentalHit.lyrics,
      message: "Instrumental version found",
      matchId: instrumentalHit.match.id,
      instrumental: true,
      synced: instrumentalHit.synced,
    }
  }

  const emptyMatch = bestEmptyMatch ?? instrumentalMatch
  if (emptyMatch) {
    attempts.push({ strategy: emptyMatch.instrumental ? "instrumental_match" : "empty_match", result: "empty" })
    report("Song found but no lyrics in database", "ready")
    return {
      status: emptyMatch.instrumental ? "instrumental" : "partial",
      strategy: emptyMatch.instrumental ? "instrumental_match" : "empty_match",
      attempts,
      message: "Song found but no lyrics in database",
      matchId: emptyMatch.id,
      instrumental: emptyMatch.instrumental,
      synced: false,
    }
  }

  report("No lyrics — you can paste or edit", "ready")
  return {
    status: "not_found",
    strategy: "none",
    attempts,
    message: "No lyrics — you can paste or edit",
    synced: false,
  }
}
