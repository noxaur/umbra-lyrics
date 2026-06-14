const DURATION_TOLERANCE_SEC = 15

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

function artistMatchScore(result: MatchableResult, artist: string): number {
  if (!artist.trim()) return 0

  const wanted = artist.trim().toLowerCase()
  const found = result.artistName.trim().toLowerCase()
  if (found === wanted) return 0
  if (found.includes(wanted) || wanted.includes(found)) return 4

  const wantedParts = wanted.split(/\s+/).filter(Boolean)
  if (wantedParts.some((part) => part.length > 1 && found.includes(part))) return 12

  return 80
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
): number {
  let score = durationScore(result, durationSec)
  score += artistMatchScore(result, artist)
  if (result.instrumental) score += 50
  if (!hasLyricsText(result)) score += 200
  return score
}

export function pickBestCandidate<T extends MatchableResult>(
  results: T[],
  durationSec: number,
  artist: string,
): T | null {
  if (results.length === 0) return null

  const scored = results
    .map((result) => ({ result, score: scoreCandidate(result, durationSec, artist) }))
    .sort((a, b) => a.score - b.score)

  const matchedLyrics = scored.find(
    ({ result }) =>
      hasLyricsText(result) &&
      !result.instrumental &&
      artistMatchScore(result, artist) < 80,
  )
  if (matchedLyrics) return matchedLyrics.result

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
