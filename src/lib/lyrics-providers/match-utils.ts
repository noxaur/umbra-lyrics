import { stripDecorativeTitle } from "@/lib/parse-track-title"

const DURATION_TOLERANCE_SEC = 15
const SYNCED_BONUS = 25

export type MatchableResult = {
  trackName: string
  artistName: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

export function hasLyricsText(result: MatchableResult): boolean {
  return Boolean(result.plainLyrics?.trim() || result.syncedLyrics?.trim())
}

export function normalizeForMatch(value: string): string {
  // Keep remix/mix/version tokens for scoring; search queries still use simplifyTrackName.
  return stripDecorativeTitle(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function textOverlap(a: string, b: string): boolean {
  const x = normalizeForMatch(a)
  const y = normalizeForMatch(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

function tokenOverlapScore(wanted: string, found: string): number | null {
  const wTokens = normalizeForMatch(wanted).split(" ").filter((part) => part.length > 1)
  const fTokens = normalizeForMatch(found).split(" ").filter((part) => part.length > 1)
  if (wTokens.length === 0 || fTokens.length === 0) return null

  const wSet = new Set(wTokens)
  const fSet = new Set(fTokens)
  let overlap = 0
  for (const token of wSet) {
    if (fSet.has(token)) overlap += 1
  }
  if (overlap === 0) return null

  const union = wSet.size + fSet.size - overlap
  const jaccard = overlap / union
  if (jaccard >= 0.85) return 0
  if (jaccard >= 0.55) return 6
  if (jaccard >= 0.35) return 12
  return 18
}

function metadataMatchScore(found: string, wanted: string): number {
  if (!wanted.trim()) return 0

  const normalizedWanted = normalizeForMatch(wanted)
  const normalizedFound = normalizeForMatch(found)
  if (normalizedFound === normalizedWanted) return 0
  if (textOverlap(found, wanted)) return 2

  const tokenScore = tokenOverlapScore(wanted, found)
  if (tokenScore != null) return tokenScore

  const wantedParts = normalizedWanted.split(/\s+/).filter(Boolean)
  if (wantedParts.some((part) => part.length > 1 && normalizedFound.includes(part))) return 12

  return 80
}

export function artistMatchScore(result: MatchableResult, artist: string): number {
  if (!artist.trim()) return 0
  return metadataMatchScore(result.artistName, artist)
}

export function trackMatchScore(result: MatchableResult, track: string): number {
  if (!track.trim()) return 0
  return metadataMatchScore(result.trackName, track)
}

function durationScore(result: MatchableResult, durationSec: number): number {
  if (durationSec <= 0 || result.duration == null) return 0
  const delta = Math.abs(result.duration - durationSec)
  return delta <= DURATION_TOLERANCE_SEC ? delta : delta + 100
}

export function scoreCandidate(
  result: MatchableResult,
  durationSec: number,
  artist: string,
  track = "",
): number {
  let score = durationScore(result, durationSec)
  score += artistMatchScore(result, artist)
  score += trackMatchScore(result, track)
  if (result.instrumental) score += 50
  if (!hasLyricsText(result)) score += 200
  if (result.syncedLyrics?.trim()) score -= SYNCED_BONUS
  return score
}

function isStrongMetadataMatch(result: MatchableResult, artist: string, track: string): boolean {
  return (
    artistMatchScore(result, artist) < 80 &&
    trackMatchScore(result, track) < 80
  )
}

export function pickBestCandidate<T extends MatchableResult>(
  results: T[],
  durationSec: number,
  artist: string,
  track = "",
): T | null {
  if (results.length === 0) return null

  const scored = results
    .map((result) => ({
      result,
      score: scoreCandidate(result, durationSec, artist, track),
    }))
    .sort((a, b) => a.score - b.score)

  const matchedLyrics = scored.find(
    ({ result }) =>
      hasLyricsText(result) &&
      !result.instrumental &&
      isStrongMetadataMatch(result, artist, track),
  )
  if (matchedLyrics) return matchedLyrics.result

  const artistMatched = scored.find(
    ({ result }) =>
      hasLyricsText(result) &&
      !result.instrumental &&
      artistMatchScore(result, artist) < 80,
  )
  if (artistMatched) return artistMatched.result

  const vocalLyrics = scored.find(({ result }) => hasLyricsText(result) && !result.instrumental)
  if (vocalLyrics) return vocalLyrics.result

  const anyLyrics = scored.find(({ result }) => hasLyricsText(result))
  if (anyLyrics) return anyLyrics.result

  return scored[0]?.result ?? null
}

export function rankHitScore(hit: {
  synced: boolean
  confidence: number
  providerPriority: number
}): number {
  let score = hit.confidence
  if (!hit.synced) score += 500
  score += hit.providerPriority * 10
  return score
}
