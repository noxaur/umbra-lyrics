import type { TranscriptSegment } from "@/lib/transcript-to-lyrics"
import { alignLinesToWords, type TranscriptWord } from "@/lib/word-alignment"
import { lyricsTextLooksLikeJunk } from "@/lib/sanitize-lyrics"
import type { LyricLine } from "@/types/lyrics"
import type { ProviderLyricsCandidate } from "@/lib/lyrics-providers/types"

export type TranscriptProfile = {
  segments: TranscriptSegment[]
  plainText: string
  words: TranscriptWord[]
  vocalDensity: number
  coverageSec: number
  language?: string
}

export type VerificationFlag =
  | "low_overlap"
  | "junk_text"
  | "timing_mismatch"
  | "language_mismatch"
  | "truncated"

export type VerificationResult = {
  score: number
  lineCoverage: number
  wordOverlap: number
  timingAgreement?: number
  flags: VerificationFlag[]
}

export type ContentAssessment = {
  type: "music" | "speech" | "mixed" | "instrumental" | "unknown"
  confidence: number
  speechRatio: number
  interruptionCount: number
  recommendTranscription: boolean
  message?: string
}

export const VERIFICATION_REJECT_THRESHOLD = 0.35
export const VERIFICATION_ACCEPT_THRESHOLD = 0.6

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9\u3040-\u9fff\uac00-\ud7af]/gi, "")
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s\n]+/)
    .map(normalizeToken)
    .filter((t) => t.length > 1)
}

function jaccardOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union > 0 ? intersection / union : 0
}

export function segmentsToWords(segments: TranscriptSegment[]): TranscriptWord[] {
  const words: TranscriptWord[] = []
  for (const seg of segments) {
    const tokens = seg.text.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const spanMs = Math.max((seg.end - seg.start) * 1000, tokens.length * 120)
    const step = spanMs / tokens.length
    const startMs = Math.round(seg.start * 1000)
    tokens.forEach((token, i) => {
      words.push({
        text: token,
        startMs: Math.round(startMs + i * step),
        endMs: Math.round(startMs + (i + 1) * step),
      })
    })
  }
  return words
}

export function buildTranscriptProfile(
  segments: TranscriptSegment[],
  options?: { language?: string; coverageSec?: number },
): TranscriptProfile {
  const plainText = segments.map((s) => s.text).join(" ").trim()
  const words = segmentsToWords(segments)
  const vocalDuration = segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0)
  const coverageSec =
    options?.coverageSec ??
    (segments.length > 0 ? segments[segments.length - 1].end : 0)
  const vocalDensity = coverageSec > 0 ? Math.min(1, vocalDuration / coverageSec) : 0

  return {
    segments,
    plainText,
    words,
    vocalDensity,
    coverageSec,
    language: options?.language,
  }
}

function lyricLinesFromCandidate(candidate: ProviderLyricsCandidate): LyricLine[] {
  const text = candidate.syncedLyrics?.trim()
    ? candidate.syncedLyrics.replace(/\[[\d:.]+\]/g, "").trim()
    : candidate.plainLyrics?.trim() ?? ""
  if (!text) return []

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => ({
      text: line,
      startMs: i * 3000,
      endMs: (i + 1) * 3000,
      kind: "lyric" as const,
    }))
}

export function verifyLyricsAgainstTranscript(
  candidate: ProviderLyricsCandidate,
  profile: TranscriptProfile | null,
): VerificationResult {
  const flags: VerificationFlag[] = []
  const lyricsText = candidate.plainLyrics?.trim() || candidate.syncedLyrics?.trim() || ""

  if (!lyricsText || !profile?.plainText.trim()) {
    return { score: 0.5, lineCoverage: 0.5, wordOverlap: 0.5, flags: [] }
  }

  if (lyricsTextLooksLikeJunk(lyricsText)) {
    flags.push("junk_text")
  }
  if (lyricsText.includes("...") && lyricsText.length < 120) {
    flags.push("truncated")
  }

  const lyricTokens = tokenize(lyricsText)
  const transcriptTokens = tokenize(profile.plainText)
  const wordOverlap = jaccardOverlap(lyricTokens, transcriptTokens)

  const lines = lyricLinesFromCandidate(candidate)
  const aligned = alignLinesToWords(lines, profile.words)
  const vocalLines = aligned.filter((l) => l.kind !== "section" && l.text.trim())
  const covered = vocalLines.filter((l) => l.words && l.words.length > 0).length
  const lineCoverage = vocalLines.length > 0 ? covered / vocalLines.length : 0

  let timingAgreement: number | undefined
  if (candidate.synced && profile.segments.length > 0 && vocalLines.length > 0) {
    const offsets: number[] = []
    for (let i = 0; i < Math.min(vocalLines.length, profile.segments.length); i++) {
      offsets.push(Math.abs(vocalLines[i].startMs - profile.segments[i].start * 1000))
    }
    const median = offsets.sort((a, b) => a - b)[Math.floor(offsets.length / 2)] ?? 9999
    timingAgreement = median < 5000 ? 1 - median / 5000 : 0
    if (timingAgreement < 0.3) flags.push("timing_mismatch")
  }

  let score = wordOverlap * 0.45 + lineCoverage * 0.45
  if (timingAgreement != null) score = score * 0.7 + timingAgreement * 0.3
  if (flags.includes("junk_text")) score *= 0.2
  if (flags.includes("truncated")) score *= 0.4
  if (wordOverlap < 0.1) flags.push("low_overlap")

  return {
    score: Math.max(0, Math.min(1, score)),
    lineCoverage,
    wordOverlap,
    timingAgreement,
    flags,
  }
}

export function assessContentType(profile: TranscriptProfile | null): ContentAssessment {
  if (!profile || profile.segments.length === 0) {
    return {
      type: "unknown",
      confidence: 0,
      speechRatio: 0,
      interruptionCount: 0,
      recommendTranscription: true,
    }
  }

  const segments = profile.segments
  const totalDuration = profile.coverageSec || segments[segments.length - 1]?.end || 0
  const longSegments = segments.filter((s) => s.end - s.start > 8)
  const speechRatio = longSegments.length / Math.max(1, segments.length)

  const tokens = tokenize(profile.plainText)
  const uniqueRatio = tokens.length > 0 ? new Set(tokens).size / tokens.length : 0

  let interruptionCount = 0
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end
    const prevLong = segments[i - 1].end - segments[i - 1].start > 6
    const nextLong = segments[i].end - segments[i].start > 6
    if (gap > 2 && prevLong && nextLong) interruptionCount++
  }

  if (profile.vocalDensity < 0.08 && totalDuration > 60) {
    return {
      type: "instrumental",
      confidence: 0.7,
      speechRatio,
      interruptionCount,
      recommendTranscription: false,
      message: "Very little vocals detected — may be instrumental",
    }
  }

  if (speechRatio > 0.5 && uniqueRatio > 0.85) {
    return {
      type: "speech",
      confidence: 0.75,
      speechRatio,
      interruptionCount,
      recommendTranscription: true,
      message: "This video looks like speech, not a song",
    }
  }

  if (interruptionCount > 2) {
    return {
      type: "mixed",
      confidence: 0.7,
      speechRatio,
      interruptionCount,
      recommendTranscription: false,
      message: "Talking detected during playback — lyrics may not match all sections",
    }
  }

  return {
    type: "music",
    confidence: 0.65,
    speechRatio,
    interruptionCount,
    recommendTranscription: false,
  }
}

export function verifyAllCandidates(
  candidates: ProviderLyricsCandidate[],
  profile: TranscriptProfile | null,
): Array<{ candidate: ProviderLyricsCandidate; verification: VerificationResult }> {
  return candidates
    .map((candidate) => ({
      candidate,
      verification: verifyLyricsAgainstTranscript(candidate, profile),
    }))
    .sort((a, b) => b.verification.score - a.verification.score)
}

export function passesVerification(verification: VerificationResult): boolean {
  return verification.score >= VERIFICATION_REJECT_THRESHOLD
}

export function isStrongVerification(verification: VerificationResult): boolean {
  return verification.score >= VERIFICATION_ACCEPT_THRESHOLD
}
