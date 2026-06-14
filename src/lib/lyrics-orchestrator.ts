import type { LyricsProviderId, LyricsResult } from "@/types/lyrics"
import {
  fetchLrclibCandidate,
  hasLyrics,
  lrclibSearchResultToCandidate,
  pickBestMatch,
} from "@/lib/lyrics-providers/lrclib-provider"
import {
  candidateToResult,
  getProviderById,
  pickBestHit,
  PROVIDER_FALLBACK_ORDER,
  searchProviders,
} from "@/lib/lyrics-providers/index"
import {
  searchByParams,
  searchByQuery,
  type SearchResult,
} from "@/lib/lyrics-service"
import { simplifyTrackName, stripDecorativeTitle } from "@/lib/parse-track-title"
import type { ProviderSearchParams } from "@/lib/lyrics-providers/types"

export type LyricsSearchAttempt = {
  strategy: string
  provider?: LyricsProviderId
  result: "found" | "empty" | "error" | "skipped"
  message?: string
}

export type LyricsOrchestratorStatus = "found" | "partial" | "not_found" | "instrumental"

export type LyricsOrchestratorResult = {
  status: LyricsOrchestratorStatus
  strategy: string
  providerId?: LyricsProviderId
  attempts: LyricsSearchAttempt[]
  lyrics?: LyricsResult
  message: string
  matchId?: number | string
  instrumental?: boolean
  synced: boolean
}

export type LyricsSearchStep = "parse" | "search" | "match" | "ready"

export type OrchestratorProgress = {
  phase: string
  step: LyricsSearchStep
  provider?: LyricsProviderId
  retryRound?: number
  maxRetries?: number
}

export type OrchestratorParams = {
  track: string
  artist: string
  title: string
  durationSec: number
  oembedAuthor?: string
  providerIds?: LyricsProviderId[]
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

function toProviderParams(params: OrchestratorParams): ProviderSearchParams {
  return {
    track: params.track,
    artist: params.artist,
    durationSec: params.durationSec,
    title: params.title,
    oembedAuthor: params.oembedAuthor,
  }
}

async function resolveLyricsFromMatch(match: SearchResult): Promise<LyricsResult | null> {
  const candidate = lrclibSearchResultToCandidate(match, toProviderParams({
    track: match.trackName,
    artist: match.artistName,
    title: "",
    durationSec: match.duration,
  }))
  const resolved = await fetchLrclibCandidate(candidate)
  if (!resolved) return null
  return candidateToResult(resolved)
}

function buildLrclibStrategies(params: OrchestratorParams): StrategyDef[] {
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
        if (simplifiedTitle) results.push(...(await searchByQuery(simplifiedTitle)))
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

async function tryResultsForLyrics(
  results: SearchResult[],
  params: OrchestratorParams,
  preferVocal: boolean,
  onProgress?: (phase: string) => void,
): Promise<{ lyrics: LyricsResult; match: SearchResult; synced: boolean } | null> {
  const ranked = pickBestMatch(results, params.durationSec, params.artist)
  if (!ranked) return null

  const ordered = [
    ranked,
    ...results
      .filter((r) => r.id !== ranked.id)
      .sort(
        (a, b) =>
          Math.abs(a.duration - params.durationSec) - Math.abs(b.duration - params.durationSec),
      ),
  ]

  const vocalFirst = preferVocal
    ? [...ordered.filter((r) => !r.instrumental && hasLyrics(r)), ...ordered]
    : ordered

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

function successResult(
  strategy: string,
  attempts: LyricsSearchAttempt[],
  lyrics: LyricsResult,
  synced: boolean,
  matchId?: number | string,
  instrumental?: boolean,
  message?: string,
): LyricsOrchestratorResult {
  return {
    status: instrumental ? "instrumental" : "found",
    strategy,
    providerId: lyrics.providerId,
    attempts,
    lyrics,
    message: message ?? (synced ? "Found synced lyrics" : "Found plain lyrics"),
    matchId,
    instrumental,
    synced,
  }
}

async function searchAlternateProviders(
  params: OrchestratorParams,
  attempts: LyricsSearchAttempt[],
  report: (phase: string, step: LyricsSearchStep, provider?: LyricsProviderId) => void,
): Promise<LyricsOrchestratorResult | null> {
  const alternateIds = (params.providerIds ?? PROVIDER_FALLBACK_ORDER).filter((id) => id !== "lrclib")
  if (alternateIds.length === 0) return null

  report("Trying alternate sources…", "search")

  const providerParams = toProviderParams(params)
  const candidates = await searchProviders({
    params: providerParams,
    providerIds: alternateIds,
    onProviderStart: (providerId, phase) => {
      report(phase, "search", providerId)
    },
  })

  for (const id of alternateIds) {
    const fromProvider = candidates.filter((c) => c.providerId === id)
    if (fromProvider.length === 0) {
      attempts.push({ strategy: id, provider: id, result: "empty", message: "No matches" })
      continue
    }

    const hit = pickBestHit(fromProvider)
    if (hit) {
      attempts.push({ strategy: id, provider: id, result: "found" })
      report(hit.result.synced ? "Found synced lyrics" : "Found plain lyrics", "ready", id)
      return successResult(
        id,
        attempts,
        hit.result,
        hit.result.synced,
        hit.result.id,
        false,
        `Found via ${getProviderById(id)?.label ?? id}`,
      )
    }

    attempts.push({ strategy: id, provider: id, result: "empty", message: "No lyrics in matches" })
  }

  return null
}

export async function orchestrateLyricsSearch(
  params: OrchestratorParams,
): Promise<LyricsOrchestratorResult> {
  const attempts: LyricsSearchAttempt[] = []
  const allResults = new Map<number, SearchResult>()
  let bestEmptyMatch: SearchResult | null = null
  let instrumentalMatch: SearchResult | null = null

  const onlyLrclib =
    params.providerIds?.length === 1 && params.providerIds[0] === "lrclib"

  const report = (
    phase: string,
    step: LyricsSearchStep,
    provider?: LyricsProviderId,
    retryRound?: number,
    maxRetries?: number,
  ) => {
    params.onProgress?.({ phase, step, provider, retryRound, maxRetries })
  }

  report("Parsing title…", "parse")

  if (!onlyLrclib && params.providerIds?.length === 1 && params.providerIds[0] !== "lrclib") {
    const singleId = params.providerIds[0]
    report(getProviderById(singleId)?.searchPhase ?? "Searching…", "search", singleId)
    const hit = await searchProviders({
      params: toProviderParams(params),
      providerIds: [singleId],
      onProviderStart: (_, phase) => report(phase, "search", singleId),
    }).then((candidates) => pickBestHit(candidates))

    if (hit) {
      attempts.push({ strategy: singleId, provider: singleId, result: "found" })
      report(hit.result.synced ? "Found synced lyrics" : "Found plain lyrics", "ready", singleId)
      return successResult(singleId, attempts, hit.result, hit.result.synced, hit.result.id)
    }

    attempts.push({ strategy: singleId, provider: singleId, result: "empty" })
    report("No lyrics — you can paste or edit", "ready")
    return {
      status: "not_found",
      strategy: singleId,
      providerId: singleId,
      attempts,
      message: "No lyrics — you can paste or edit",
      synced: false,
    }
  }

  const strategies = buildLrclibStrategies(params)

  for (const strategy of strategies) {
    if (strategy.skip?.()) {
      attempts.push({
        strategy: strategy.name,
        provider: "lrclib",
        result: "skipped",
        message: "Nothing to search",
      })
      continue
    }

    report(strategy.phase, "search", "lrclib")

    let results: SearchResult[] = []
    try {
      results = await withNetworkRetry(strategy.run, (retryRound, maxRetries) => {
        report(`Retrying (${retryRound}/${maxRetries})…`, "search", "lrclib", retryRound, maxRetries)
      })
    } catch (error) {
      attempts.push({
        strategy: strategy.name,
        provider: "lrclib",
        result: "error",
        message: error instanceof Error ? error.message : "Network error",
      })
      continue
    }

    for (const result of results) allResults.set(result.id, result)

    if (results.length === 0) {
      attempts.push({
        strategy: strategy.name,
        provider: "lrclib",
        result: "empty",
        message: "No matches",
      })
      continue
    }

    report("Matching results…", "match", "lrclib")

    const hit = await tryResultsForLyrics(results, params, true, (phase) =>
      report(phase, "match", "lrclib"),
    )

    if (hit) {
      attempts.push({ strategy: strategy.name, provider: "lrclib", result: "found" })
      report(hit.synced ? "Found synced lyrics" : "Found plain lyrics", "ready", "lrclib")
      return successResult(
        strategy.name,
        attempts,
        hit.lyrics,
        hit.synced,
        hit.match.id,
        hit.match.instrumental,
      )
    }

    const best = pickBestMatch(results, params.durationSec, params.artist)
    if (best) {
      if (best.instrumental) instrumentalMatch = best
      else if (!hasLyrics(best)) bestEmptyMatch = best
    }

    attempts.push({
      strategy: strategy.name,
      provider: "lrclib",
      result: "empty",
      message: "No lyrics in matches",
    })
  }

  report("Trying each search result by ID…", "search", "lrclib")

  const resultsWithLyrics = [...allResults.values()].filter((r) => hasLyrics(r))
  const getByIdCandidates = resultsWithLyrics.length > 0 ? resultsWithLyrics : [...allResults.values()]

  if (getByIdCandidates.length > 0) {
    const hit = await tryResultsForLyrics(getByIdCandidates, params, true, (phase) =>
      report(phase, "match", "lrclib"),
    )

    if (hit) {
      attempts.push({ strategy: "get_by_id", provider: "lrclib", result: "found" })
      report(hit.synced ? "Found synced lyrics" : "Found plain lyrics", "ready", "lrclib")
      return successResult("get_by_id", attempts, hit.lyrics, hit.synced, hit.match.id, hit.match.instrumental)
    }

    attempts.push({
      strategy: "get_by_id",
      provider: "lrclib",
      result: "empty",
      message: "No lyrics via /get",
    })
  }

  if (!onlyLrclib) {
    const alternate = await searchAlternateProviders(params, attempts, report)
    if (alternate) return alternate
  }

  report("Trying instrumental matches…", "match", "lrclib")

  const instrumentalHit = await tryResultsForLyrics(
    [...allResults.values()].filter((r) => r.instrumental),
    params,
    false,
    (phase) => report(phase, "match", "lrclib"),
  )

  if (instrumentalHit) {
    attempts.push({ strategy: "instrumental_fallback", provider: "lrclib", result: "found" })
    report("Found instrumental track", "ready", "lrclib")
    return {
      status: "instrumental",
      strategy: "instrumental_fallback",
      providerId: "lrclib",
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
    attempts.push({
      strategy: emptyMatch.instrumental ? "instrumental_match" : "empty_match",
      provider: "lrclib",
      result: "empty",
    })
    report("Song found but no lyrics in database", "ready")
    return {
      status: emptyMatch.instrumental ? "instrumental" : "partial",
      strategy: emptyMatch.instrumental ? "instrumental_match" : "empty_match",
      providerId: "lrclib",
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
