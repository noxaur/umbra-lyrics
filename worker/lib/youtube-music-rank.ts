export type YouTubeMusicHit = {
  videoId: string
  title: string
  channel: string
  durationSec: number | null
  viewCount?: number
  resultType?: "song" | "video" | "album" | "playlist" | "artist" | "unknown"
  isOfficialAudio?: boolean
}

const BAD_CANONICAL_RE =
  /\b(cover|reaction|tutorial|lesson|behind the scenes|interview|live|remix|karaoke|instrumental|fingerstyle)\b|(?:\ba\.?\s*gt\s+session\b|\ba\.?\s*gt\s+ver\.?\b|(?:guitar|piano|acoustic)\s+session\b|(?:guitar|piano|acoustic)\s+ver\.?\b)/i
const VIDEO_RE = /\b(official\s+music\s+video|music\s+video|mv|lyric\s+video|lyrics?)\b/i
const TOPIC_RE = /\s-\sTopic$/i

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function textMatchScore(candidate: string, expected: string): number {
  const c = normalize(candidate)
  const e = normalize(expected)
  if (!e) return 0
  if (!c) return 45
  if (c === e) return 0
  if (c.includes(e) || e.includes(c)) return 8

  const candidateTokens = new Set(c.split(" ").filter(Boolean))
  const expectedTokens = e.split(" ").filter(Boolean)
  if (expectedTokens.length === 0) return 0
  const matched = expectedTokens.filter((token) => candidateTokens.has(token)).length
  return Math.round((1 - matched / expectedTokens.length) * 45)
}

function durationDeltaScore(candidateSec: number | null, targetSec?: number): number {
  if (!targetSec || !candidateSec) return 12
  const delta = Math.abs(candidateSec - targetSec)
  if (delta <= 3) return 0
  if (delta <= 10) return 4
  if (delta <= 25) return 12
  return 35
}

export function scoreYouTubeMusicHit(
  hit: YouTubeMusicHit,
  artist: string,
  track: string,
  durationSec?: number,
): number {
  let score = durationDeltaScore(hit.durationSec, durationSec)
  score += textMatchScore(hit.channel, artist)
  score += textMatchScore(hit.title, track)

  if (hit.resultType === "song") score -= 30
  if (hit.isOfficialAudio) score -= 24
  if (TOPIC_RE.test(hit.channel)) score -= 16
  if (hit.resultType === "video") score += 12
  if (VIDEO_RE.test(hit.title)) score += 16
  if (BAD_CANONICAL_RE.test(hit.title) || BAD_CANONICAL_RE.test(hit.channel)) score += 80
  if (hit.durationSec && hit.durationSec < 60) score += 30
  if (hit.durationSec && hit.durationSec > 900) score += 18

  return score
}

const MAX_CANONICAL_SCORE = 74

export { MAX_CANONICAL_SCORE }

export function pickBestYouTubeMusicHit(
  hits: YouTubeMusicHit[],
  artist: string,
  track: string,
  durationSec?: number,
): YouTubeMusicHit | null {
  const ranked = [...hits]
    .map((hit) => ({ hit, score: scoreYouTubeMusicHit(hit, artist, track, durationSec) }))
    .sort((a, b) => a.score - b.score)

  const best = ranked[0]
  if (!best || best.score > MAX_CANONICAL_SCORE) return null
  return best.hit
}
