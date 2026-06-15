import { detectLanguage } from "@/lib/language-service"
import { scoreCandidate } from "@/lib/lyrics-providers/match-utils"
import type { LyricsProviderId } from "@/types/lyrics"
import type { ProviderLyricsCandidate } from "@/lib/lyrics-providers/types"

/**
 * Lyrics candidate ranking weights (lower score = better match).
 *
 * | Factor                     | Weight | Notes                           |
 * |----------------------------|--------|---------------------------------|
 * | Plain (not synced)         | +500   | Synced LRC strongly preferred   |
 * | Provider priority          | +10×   | lrclib=1, musicbrainz=2, …      |
 * | Title/artist confidence    | +0–80+ | duration + fuzzy artist match   |
 * | Instrumental               | +50    | Prefer vocal versions           |
 * | Empty lyrics               | +200   | Deprioritize lyric-less hits    |
 * | Language mismatch          | +150   | franc vs preferredLanguage      |
 * | Low line count (<4 lines)  | +100   | Completeness heuristic          |
 * | Very short text (<80 chars)| +80    | Likely snippet or incomplete    |
 */
export const RANK_WEIGHTS = {
  PLAIN_NOT_SYNCED: 500,
  PROVIDER_PRIORITY_MULT: 10,
  LANGUAGE_MISMATCH: 150,
  LOW_LINE_COUNT: 100,
  SHORT_TEXT: 80,
  MIN_LINES_FOR_FULL: 4,
  MIN_CHARS_FOR_FULL: 80,
} as const

export type LyricsRankContext = {
  durationSec: number
  artist: string
  track: string
  preferredLanguage?: string
  providerPriority: (id: LyricsProviderId) => number
}

export type RankedLyricsCandidate = {
  candidate: ProviderLyricsCandidate
  score: number
  lineCount: number
}

function stripLrcTimestamps(text: string): string {
  return text
    .replace(/\[[\d:.]+\]/g, "")
    .replace(/<\d{2}:\d{2}\.\d{2}>/g, "")
    .trim()
}

export function lyricsTextOf(candidate: ProviderLyricsCandidate): string {
  if (candidate.syncedLyrics?.trim()) return stripLrcTimestamps(candidate.syncedLyrics)
  return candidate.plainLyrics?.trim() ?? ""
}

export function countLyricLines(candidate: ProviderLyricsCandidate): number {
  const text = lyricsTextOf(candidate)
  if (!text) return 0
  return text.split("\n").filter((line) => line.trim().length > 0).length
}

function languageMismatchPenalty(text: string, preferredLanguage?: string): number {
  if (!preferredLanguage?.trim() || !text.trim()) return 0
  const detected = detectLanguage(text)
  if (detected === preferredLanguage) return 0
  if (detected === "und" || preferredLanguage === "und") return RANK_WEIGHTS.LANGUAGE_MISMATCH / 3
  return RANK_WEIGHTS.LANGUAGE_MISMATCH
}

export function rankLyricsCandidate(
  candidate: ProviderLyricsCandidate,
  context: LyricsRankContext,
): number {
  let score = scoreCandidate(candidate, context.durationSec, context.artist)

  if (!candidate.synced) score += RANK_WEIGHTS.PLAIN_NOT_SYNCED
  score += context.providerPriority(candidate.providerId) * RANK_WEIGHTS.PROVIDER_PRIORITY_MULT

  const text = lyricsTextOf(candidate)
  const lineCount = countLyricLines(candidate)
  if (lineCount > 0 && lineCount < RANK_WEIGHTS.MIN_LINES_FOR_FULL) {
    score += RANK_WEIGHTS.LOW_LINE_COUNT
  }
  if (text.length > 0 && text.length < RANK_WEIGHTS.MIN_CHARS_FOR_FULL) {
    score += RANK_WEIGHTS.SHORT_TEXT
  }

  score += languageMismatchPenalty(text, context.preferredLanguage)

  return score
}

export function rankLyricsCandidates(
  candidates: ProviderLyricsCandidate[],
  context: LyricsRankContext,
): RankedLyricsCandidate[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: rankLyricsCandidate(candidate, context),
      lineCount: countLyricLines(candidate),
    }))
    .sort((a, b) => a.score - b.score)
}

export function pickBestAndAlternates(
  candidates: ProviderLyricsCandidate[],
  context: LyricsRankContext,
): { best: RankedLyricsCandidate | null; alternates: RankedLyricsCandidate[] } {
  const ranked = rankLyricsCandidates(candidates, context)
  const withLyrics = ranked.filter(
    (r) =>
      lyricsTextOf(r.candidate).length > 0 &&
      !r.candidate.instrumental,
  )

  if (withLyrics.length > 0) {
    return { best: withLyrics[0], alternates: withLyrics.slice(1) }
  }

  const instrumental = ranked.filter(
    (r) => lyricsTextOf(r.candidate).length > 0 && r.candidate.instrumental,
  )
  if (instrumental.length > 0) {
    return { best: instrumental[0], alternates: instrumental.slice(1) }
  }

  const anyText = ranked.filter((r) => lyricsTextOf(r.candidate).length > 0)
  if (anyText.length > 0) {
    return { best: anyText[0], alternates: anyText.slice(1) }
  }

  return { best: ranked[0] ?? null, alternates: ranked.slice(1) }
}
